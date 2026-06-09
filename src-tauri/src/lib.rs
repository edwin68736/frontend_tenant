mod tenant_binding;

mod commands {
    #[cfg(windows)]
    fn to_wide_null(s: &str) -> Vec<u16> {
        use std::os::windows::prelude::OsStrExt;
        std::ffi::OsStr::new(s)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    #[cfg(windows)]
    fn win_last_error(prefix: &str) -> String {
        use windows_sys::Win32::Foundation::GetLastError;
        let code = unsafe { GetLastError() };
        if code == 0 {
            prefix.to_string()
        } else {
            format!("{prefix} (win32={code})")
        }
    }

    #[cfg(windows)]
    fn wide_ptr_to_string(ptr: *const u16) -> String {
        if ptr.is_null() {
            return String::new();
        }
        let mut len = 0usize;
        unsafe {
            while *ptr.add(len) != 0 {
                len += 1;
            }
            let slice = std::slice::from_raw_parts(ptr, len);
            String::from_utf16_lossy(slice)
        }
    }

    #[cfg(windows)]
    fn list_printers_windows() -> Result<Vec<String>, String> {
        use std::mem::size_of;
        use windows_sys::Win32::Graphics::Printing::{
            EnumPrintersW, PRINTER_ENUM_CONNECTIONS, PRINTER_ENUM_LOCAL, PRINTER_INFO_4W,
        };

        let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
        let level = 4u32;
        let mut needed = 0u32;
        let mut returned = 0u32;

        unsafe {
            let _ = EnumPrintersW(
                flags,
                std::ptr::null(),
                level,
                std::ptr::null_mut(),
                0,
                &mut needed,
                &mut returned,
            );
        }

        if needed == 0 {
            return Ok(vec![]);
        }

        let mut buffer = vec![0u8; needed as usize];
        let ok = unsafe {
            EnumPrintersW(
                flags,
                std::ptr::null(),
                level,
                buffer.as_mut_ptr(),
                needed,
                &mut needed,
                &mut returned,
            )
        };

        if ok == 0 {
            return Err("No se pudo enumerar impresoras".to_string());
        }

        let mut out = Vec::with_capacity(returned as usize);
        for i in 0..returned as usize {
            let base = buffer.as_ptr() as usize + i * size_of::<PRINTER_INFO_4W>();
            let info = unsafe { &*(base as *const PRINTER_INFO_4W) };
            let name = wide_ptr_to_string(info.pPrinterName);
            if !name.trim().is_empty() {
                out.push(name);
            }
        }

        out.sort();
        out.dedup();
        Ok(out)
    }

    /// Envío RAW (ESC/POS) a impresora de red (puerto típico 9100).
    fn write_raw_to_tcp(host: &str, port: u16, data: &[u8]) -> Result<(), String> {
        use std::io::Write;
        use std::net::ToSocketAddrs;
        use std::time::Duration;

        let host = host.trim();
        if host.is_empty() {
            return Err("Host/IP vacío".to_string());
        }
        if port == 0 {
            return Err("Puerto inválido".to_string());
        }

        let addrs: Vec<_> = (host, port)
            .to_socket_addrs()
            .map_err(|e| format!("No se pudo resolver la dirección: {e}"))?
            .collect();

        let addr = addrs
            .into_iter()
            .next()
            .ok_or_else(|| "Sin dirección para conectar".to_string())?;

        let mut stream = std::net::TcpStream::connect_timeout(&addr, Duration::from_secs(8))
            .map_err(|e| format!("No se pudo conectar a {host}:{port} — {e}"))?;

        let _ = stream.set_write_timeout(Some(Duration::from_secs(20)));
        let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));

        stream
            .write_all(data)
            .map_err(|e| format!("Error enviando datos por TCP: {e}"))?;
        stream
            .flush()
            .map_err(|e| format!("Error en flush TCP: {e}"))?;

        Ok(())
    }

    #[tauri::command]
    pub fn list_printers() -> Result<Vec<String>, String> {
        #[cfg(windows)]
        {
            return list_printers_windows();
        }
        #[cfg(not(windows))]
        {
            Ok(vec![])
        }
    }

    #[derive(serde::Deserialize)]
    pub struct TestPrintInput {
        /// `"windows"` | `"network"`. Ausente = windows (compatibilidad).
        pub mode: Option<String>,
        pub printer_name: String,
        pub tcp_host: Option<String>,
        pub tcp_port: Option<u16>,
        pub paper_width_mm: u16,
        pub kind: String,
    }

    #[cfg(windows)]
    fn build_test_ticket(kind: &str, paper_width_mm: u16) -> Vec<u8> {
        let columns = if paper_width_mm <= 58 { 32 } else { 48 };
        let mut out: Vec<u8> = Vec::new();

        out.extend_from_slice(&[0x1B, 0x40]);
        out.extend_from_slice(b"Tukichef\n");
        out.extend_from_slice(b"==============================\n");

        let title = match kind {
            "comandas" => "PRUEBA COMANDA",
            "precuenta" => "PRUEBA PRECUENTA",
            "documentos" => "PRUEBA DOCUMENTO",
            _ => "PRUEBA",
        };

        out.extend_from_slice(title.as_bytes());
        out.extend_from_slice(b"\n");

        let sep = "=".repeat(columns.min(48));
        out.extend_from_slice(sep.as_bytes());
        out.extend_from_slice(b"\n");

        out.extend_from_slice(b"Item ficticio 1      x1  S/ 10.00\n");
        out.extend_from_slice(b"Item ficticio 2      x2  S/ 15.00\n");
        out.extend_from_slice(b"\n");
        out.extend_from_slice(b"TOTAL:                    S/ 25.00\n");
        out.extend_from_slice(b"\n\n\n");
        out.extend_from_slice(&[0x1D, 0x56, 0x41, 0x10]);
        out
    }

    #[cfg(windows)]
    fn write_raw_to_printer(
        printer_name: &str,
        doc_title: &str,
        data: &[u8],
    ) -> Result<(), String> {
        use std::ptr::null_mut;
        use windows_sys::Win32::Foundation::HANDLE;
        use windows_sys::Win32::Graphics::Printing::{
            ClosePrinter, EndDocPrinter, EndPagePrinter, OpenPrinterW, StartDocPrinterW,
            StartPagePrinter, WritePrinter, DOC_INFO_1W,
        };

        let printer_w = to_wide_null(printer_name);
        let mut handle: HANDLE = null_mut();

        let ok_open = unsafe { OpenPrinterW(printer_w.as_ptr(), &mut handle, null_mut()) };
        if ok_open == 0 || handle.is_null() {
            return Err(win_last_error("No se pudo abrir la impresora"));
        }

        let doc_name = to_wide_null(doc_title);
        let data_type = to_wide_null("RAW");
        let mut doc_info = DOC_INFO_1W {
            pDocName: doc_name.as_ptr() as *mut u16,
            pOutputFile: null_mut(),
            pDatatype: data_type.as_ptr() as *mut u16,
        };

        let doc_id = unsafe { StartDocPrinterW(handle, 1, (&mut doc_info) as *mut _ as *mut _) };
        if doc_id == 0 {
            unsafe { ClosePrinter(handle) };
            return Err(win_last_error(
                "No se pudo iniciar el documento de impresión",
            ));
        }

        let ok_page = unsafe { StartPagePrinter(handle) };
        if ok_page == 0 {
            unsafe {
                EndDocPrinter(handle);
                ClosePrinter(handle);
            }
            return Err(win_last_error("No se pudo iniciar la página de impresión"));
        }

        let mut written = 0u32;
        let ok_write = unsafe {
            WritePrinter(
                handle,
                data.as_ptr() as *mut _,
                data.len() as u32,
                &mut written,
            )
        };

        unsafe {
            EndPagePrinter(handle);
            EndDocPrinter(handle);
            ClosePrinter(handle);
        }

        if ok_write == 0 {
            return Err(win_last_error("No se pudo enviar datos a la impresora"));
        }
        if written as usize != data.len() {
            return Err(format!(
                "Envío incompleto a la impresora (enviado {} de {} bytes)",
                written,
                data.len()
            ));
        }
        Ok(())
    }

    #[tauri::command]
    pub fn printers_test_print(input: TestPrintInput) -> Result<String, String> {
        let TestPrintInput {
            mode,
            printer_name,
            tcp_host,
            tcp_port,
            paper_width_mm,
            kind,
        } = input;

        let mode = mode.as_deref().unwrap_or("windows");
        println!(
            "[printers_test_print] mode='{}' printer='{}' tcp={:?}:{:?} kind='{}' width_mm={}",
            mode, printer_name, tcp_host, tcp_port, kind, paper_width_mm
        );

        let bytes = {
            #[cfg(windows)]
            {
                build_test_ticket(&kind, paper_width_mm)
            }
            #[cfg(not(windows))]
            {
                build_test_ticket_generic(&kind, paper_width_mm)
            }
        };

        if mode == "network" {
            let host = tcp_host.as_deref().unwrap_or("").trim();
            let port = tcp_port.unwrap_or(9100);
            if host.is_empty() {
                return Err("tcp_host vacío (modo red)".to_string());
            }
            println!("[printers_test_print] tcp bytes={}", bytes.len());
            write_raw_to_tcp(host, port, &bytes)?;
            println!("[printers_test_print] OK TCP");
            return Ok(format!("Enviado por TCP a {host}:{port}"));
        }

        #[cfg(windows)]
        {
            if printer_name.trim().is_empty() {
                return Err("printer_name vacío (modo Windows)".to_string());
            }
            println!("[printers_test_print] bytes={}", bytes.len());
            write_raw_to_printer(&printer_name, "Tukichef - Test", &bytes)?;
            println!("[printers_test_print] OK");
            return Ok("Enviado a la impresora Windows (RAW)".to_string());
        }

        #[cfg(not(windows))]
        {
            let _ = printer_name;
            Err("Impresión Windows solo en Windows. Usa modo red (TCP).".to_string())
        }
    }

    #[cfg(not(windows))]
    fn build_test_ticket_generic(kind: &str, paper_width_mm: u16) -> Vec<u8> {
        let columns = if paper_width_mm <= 58 { 32 } else { 48 };
        let mut out: Vec<u8> = Vec::new();
        out.extend_from_slice(&[0x1B, 0x40]);
        out.extend_from_slice(b"Tukichef\n");
        out.extend_from_slice(b"==============================\n");
        let title = match kind {
            "comandas" => "PRUEBA COMANDA",
            "precuenta" => "PRUEBA PRECUENTA",
            "documentos" => "PRUEBA DOCUMENTO",
            _ => "PRUEBA",
        };
        out.extend_from_slice(title.as_bytes());
        out.extend_from_slice(b"\n");
        let sep = "=".repeat(columns.min(48));
        out.extend_from_slice(sep.as_bytes());
        out.extend_from_slice(b"\n\n\n");
        out.extend_from_slice(&[0x1D, 0x56, 0x41, 0x10]);
        out
    }

    #[derive(serde::Deserialize)]
    pub struct RawPrintInput {
        pub mode: Option<String>,
        pub printer_name: String,
        pub tcp_host: Option<String>,
        pub tcp_port: Option<u16>,
        pub data_base64: String,
        pub doc_name: Option<String>,
    }

    #[tauri::command]
    pub fn printers_print_raw(input: RawPrintInput) -> Result<String, String> {
        use base64::Engine;

        let RawPrintInput {
            mode,
            printer_name,
            tcp_host,
            tcp_port,
            data_base64,
            doc_name,
        } = input;

        let mode = mode.as_deref().unwrap_or("windows");
        println!(
            "[printers_print_raw] mode='{}' printer='{}' tcp={:?}:{:?} bytes_b64={}",
            mode,
            printer_name,
            tcp_host,
            tcp_port,
            data_base64.len()
        );

        if data_base64.trim().is_empty() {
            return Err("data_base64 vacío".to_string());
        }

        let decoded = base64::engine::general_purpose::STANDARD
            .decode(data_base64.as_bytes())
            .map_err(|e| format!("Base64 inválido: {e}"))?;

        if mode == "network" {
            let host = tcp_host.as_deref().unwrap_or("").trim();
            let port = tcp_port.unwrap_or(9100);
            if host.is_empty() {
                return Err("tcp_host vacío (modo red)".to_string());
            }
            if port == 0 {
                return Err("puerto inválido".to_string());
            }
            println!(
                "[printers_print_raw] tcp {host}:{port} bytes={}",
                decoded.len()
            );
            let _title = doc_name.unwrap_or_else(|| "Tukichef - Print".to_string());
            write_raw_to_tcp(host, port, &decoded)?;
            println!("[printers_print_raw] OK TCP");
            return Ok(format!("Enviado por TCP a {host}:{port} (RAW)"));
        }

        #[cfg(windows)]
        {
            if printer_name.trim().is_empty() {
                return Err("printer_name vacío (modo Windows)".to_string());
            }
            println!("[printers_print_raw] bytes={}", decoded.len());
            let title = doc_name.unwrap_or_else(|| "Tukichef - Print".to_string());
            write_raw_to_printer(&printer_name, &title, &decoded)?;
            println!("[printers_print_raw] OK");
            return Ok("Enviado a la impresora Windows (RAW)".to_string());
        }

        #[cfg(not(windows))]
        {
            let _ = (printer_name, doc_name);
            Err("Impresión Windows solo en Windows. Usa modo red (TCP).".to_string())
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::list_printers,
            commands::printers_test_print,
            commands::printers_print_raw,
            tenant_binding::tenant_binding_read,
            tenant_binding::tenant_binding_write,
            tenant_binding::tenant_binding_clear,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
