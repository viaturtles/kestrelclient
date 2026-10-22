#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod account;
mod config;
mod content;
mod core;
mod discord;
mod discord_account;
mod download;
mod import;
mod instances;
mod java;
mod launch;
mod modrinth;
mod mojang;
mod nbt;
mod servers;
mod share;
#[cfg(test)]
mod tests;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .manage(core::AppState::new())
        .invoke_handler(tauri::generate_handler![
            instances::app_paths,
            instances::prepare_instance,
            instances::list_content,
            instances::set_content_enabled,
            instances::delete_content,
            instances::open_folder,
            instances::reveal_file,
            instances::open_link,
            java::detect_java,
            java::install_java_runtime,
            mojang::mc_versions,
            mojang::install_game,
            mojang::game_status,
            mojang::cancel_job,
            modrinth::modrinth_search,
            modrinth::modrinth_project,
            modrinth::modrinth_versions,
            modrinth::install_content,
            servers::ping_server,
            launch::launch_game,
            launch::stop_game,
            launch::relaunch_last,
            content::get_active_packs,
            content::set_active_packs,
            launch::mission_snapshot,
            launch::list_launches,
            launch::read_launch,
            import::import_scan,
            import::import_into,
            import::optifine_list,
            import::optifine_run_installer,
            import::optifine_import,
            content::identify_content,
            content::import_files,
            content::list_worlds,
            content::backup_world,
            share::export_installation,
            share::read_installation_file,
            account::account_status,
            account::account_sign_in,
            account::account_sign_out,
            discord_account::discord_user,
            discord_account::discord_link,
            discord_account::discord_unlink,
            discord::discord_prefs,
            discord::discord_launcher,
        ])
        // Closing the main window quits Kestrel, even if Launch Control is open.
        .on_window_event(|window, event| {
            if window.label() == "main" && matches!(event, tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed) {
                use tauri::Manager;
                window.app_handle().state::<core::AppState>().discord.shutdown();
                window.app_handle().exit(0);
            }
        })
        .build(tauri::generate_context!())
        .expect("Unable to start Kestrel")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                use tauri::Manager;
                app.state::<core::AppState>().discord.shutdown();
            }
        });
}
