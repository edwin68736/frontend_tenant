mod tenant_binding;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            tenant_binding::tenant_binding_read,
            tenant_binding::tenant_binding_write,
            tenant_binding::tenant_binding_clear,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
