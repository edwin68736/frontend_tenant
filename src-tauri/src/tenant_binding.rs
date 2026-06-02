use std::fs;
use std::path::PathBuf;
use tauri::Manager;

const FILE_NAME: &str = "tenant-binding.json";

fn binding_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(FILE_NAME))
}

#[tauri::command]
pub fn tenant_binding_read(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = binding_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    if raw.trim().is_empty() {
        return Ok(None);
    }
    Ok(Some(raw))
}

#[tauri::command]
pub fn tenant_binding_write(app: tauri::AppHandle, payload: String) -> Result<(), String> {
    if payload.trim().is_empty() {
        return Err("payload vacío".to_string());
    }
    let path = binding_path(&app)?;
    fs::write(&path, payload.as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn tenant_binding_clear(app: tauri::AppHandle) -> Result<(), String> {
    let path = binding_path(&app)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}
