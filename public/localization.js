// Localization file for Persona Character Simulation
// Contains UI text in multiple languages

const localization = {
  "english": {
    // HTML title and navbar
    "page_title": "Persona - Professional Character Simulation",
    "app_subtitle": "Professional Character Simulation",
    "new_session_btn": "New Session",
    "load_session_btn": "Load Session",
    
    // Session info
    "no_active_session": "No active session",
    "active_session": "Active session",
    "save_session_btn": "Save Session",
    
    // Setup form
    "create_simulation_title": "Create Your Simulation",
    "api_key_label": "Anthropic API Key (Optional)",
    "api_key_help": "Leave blank to use the server's default API key if configured.",
    "select_character_label": "Select Character Type",
    "select_character_placeholder": "Choose a character to simulate...",
    "character_select_help": "Select a character type for your conversation simulation.",
    
    // Character types
    "character_career_mentor": "Career Mentor - Professional development guidance",
    "character_listener": "Supportive Listener - Emotional support and processing",
    "character_life_coach": "Life Coach - Personal goals and self-improvement",
    "character_divorced_mother": "Divorced Mother - Life topics",
    "character_married_wife": "Alexandra Rutz - Married Wife",
    "character_librarian": "Naomi Chen - Librarian",
    "character_inspector": "Inspector Blackwood - Analytical problem solver",
    "character_teenage_girl": "Teenage girl - Adolescent problems",
    "character_matilda": "Matilda Martin - German teenage girl",
    "character_custom": "Custom Character - Create your own",
    
    // Custom profile
    "custom_profile_title": "Custom Character Profile",
    "custom_profile_json_label": "Custom Character Profile (JSON)",
    
    // Scenario and memory
    "starting_scenario_label": "Starting Scenario (Optional)",
    "starting_scenario_help": "Describe the initial context for your conversation with the character.",
    "deep_memory_label": "Deep Memory",
    "persistent_deep_memory": "Persistent Deep Memory",
    "deep_memory_help": "Add important information that will never be compressed or forgotten. This will always be included with each prompt.",
    
    // Advanced options
    "advanced_options_title": "Advanced Options",
    "enable_compression_label": "Enable Memory Compression",
    "compression_help": "Periodically summarizes conversation history to optimize performance.",
    "model_label": "Model",
    "model_help": "Select the Claude model to use for this character.",
    "language_label": "Language",
    "language_help": "Select the language for your conversation with the character.",
    
    // Buttons
    "start_session_btn": "Start Session",
    "cancel_btn": "Cancel",
    "delete_session_btn": "Delete Session",
    "load_session_confirm_btn": "Load Session",
    "memory_btn": "Memory",
    "hide_memory_btn": "Hide Memory",
    "compress_btn": "Compress",
    "compress_now_btn": "Compress Now",
    "update_deep_memory_btn": "Update Deep Memory",
    "save_deep_memory_btn": "Save Deep Memory",
    
    // Session loading
    "load_saved_session_title": "Load Saved Session",
    "select_session_label": "Select a saved session",
    "select_session_placeholder": "Choose a session to continue...",
    "load_api_key_label": "API Key (if different from original)",
    "load_api_key_placeholder": "Enter API key if needed",
    "load_model_label": "Model (optional)",
    "use_original_model": "Use original model",
    "load_model_help": "Select a different model or leave as is to use the original.",
    
    // Memory panel
    "memory_system_title": "Memory System",
    "short_term_label": "Short-Term",
    "long_term_label": "Long-Term",
    "deep_memory_panel_label": "Deep Memory",
    "stats_label": "Stats",
    "current_deep_memory": "Current Deep Memory:",
    
    // Compression panel
    "memory_compression_title": "Memory Compression",
    "enabled_label": "Enabled",
    "api_calls_since_compression": "API calls since last compression:",
    "last_compression": "Last compression:",
    "never": "Never",
    "compression_count": "Compression count:",
    "last_reduction": "Last reduction:",
    
    // Chat UI
    "welcome_title": "Welcome to Your Simulation",
    "welcome_text": "Your conversation will appear here. Start by introducing yourself or asking a question.",
    "message_placeholder": "Type your message... (Shift+Enter for new line)",
    
    // System messages
    "session_loaded": "Session loaded! Continue your conversation with",
    "connected": "Connected!",
    "memory_compressed": "Memory compressed:",
    "compression_skipped": "Compression skipped:",
    "last_saved": "Last saved:",

    // Character Browser
    "character_browser_btn": "Character Browser",
    "character_browser_title": "Character Browser",
    "character_search_placeholder": "Search characters by name, appearance, personality, topics...",
    "select_character_btn": "Select Character",
    "previous_chats_btn": "Previous Chats",
    "previous_chats_title": "Previous Chats"
  },
  
  "deutsch": {
    // HTML title and navbar
    "page_title": "Persona - Professionelle Charaktersimulation",
    "app_subtitle": "Professionelle Charaktersimulation",
    "new_session_btn": "Neue Sitzung",
    "load_session_btn": "Sitzung laden",
    
    // Session info
    "no_active_session": "Keine aktive Sitzung",
    "active_session": "Aktive Sitzung",
    "save_session_btn": "Sitzung speichern",
    
    // Setup form
    "create_simulation_title": "Simulation erstellen",
    "api_key_label": "Anthropic API-Schlüssel (Optional)",
    "api_key_help": "Leer lassen, um den Standard-API-Schlüssel des Servers zu verwenden, falls konfiguriert.",
    "select_character_label": "Charaktertyp auswählen",
    "select_character_placeholder": "Wählen Sie einen zu simulierenden Charakter...",
    "character_select_help": "Wählen Sie einen Charaktertyp für Ihre Gesprächssimulation.",
    
    // Character types
    "character_career_mentor": "Karriere-Mentor - Professionelle Entwicklungsberatung",
    "character_listener": "Unterstützender Zuhörer - Emotionale Unterstützung und Verarbeitung",
    "character_life_coach": "Lebenscoach - Persönliche Ziele und Selbstverbesserung",
    "character_divorced_mother": "Geschiedene Mutter - Lebensthemen",
    "character_married_wife": "Alexandra Rutz - Verheiratete Ehefrau",
    "character_librarian": "Naomi Chen - Büchereimitarbeiterin",
    "character_inspector": "Inspektor Blackwood - Analytischer Problemlöser",
    "character_teenage_girl": "Teenagermädchen - Adoleszenzprobleme",
    "character_matilda": "Matilda Martin - Deutsches Teenagermädchen",
    "character_custom": "Benutzerdefinierter Charakter - Erstellen Sie Ihren eigenen",
    
    // Custom profile
    "custom_profile_title": "Benutzerdefiniertes Charakterprofil",
    "custom_profile_json_label": "Benutzerdefiniertes Charakterprofil (JSON)",
    
    // Scenario and memory
    "starting_scenario_label": "Ausgangsszenario (Optional)",
    "starting_scenario_help": "Beschreiben Sie den Anfangskontext für Ihr Gespräch mit dem Charakter.",
    "deep_memory_label": "Tiefes Gedächtnis",
    "persistent_deep_memory": "Dauerhaftes tiefes Gedächtnis",
    "deep_memory_help": "Fügen Sie wichtige Informationen hinzu, die niemals komprimiert oder vergessen werden. Diese werden immer mit jedem Prompt mitgeliefert.",
    
    // Advanced options
    "advanced_options_title": "Erweiterte Optionen",
    "enable_compression_label": "Gedächtniskompression aktivieren",
    "compression_help": "Fasst regelmäßig den Gesprächsverlauf zusammen, um die Leistung zu optimieren.",
    "model_label": "Modell",
    "model_help": "Wählen Sie das Claude-Modell für diesen Charakter.",
    "language_label": "Sprache",
    "language_help": "Wählen Sie die Sprache für Ihr Gespräch mit dem Charakter.",
    
    // Buttons
    "start_session_btn": "Sitzung starten",
    "cancel_btn": "Abbrechen",
    "delete_session_btn": "Sitzung löschen",
    "load_session_confirm_btn": "Sitzung laden",
    "memory_btn": "Gedächtnis",
    "hide_memory_btn": "Gedächtnis ausblenden",
    "compress_btn": "Komprimieren",
    "compress_now_btn": "Jetzt komprimieren",
    "update_deep_memory_btn": "Tiefes Gedächtnis aktualisieren",
    "save_deep_memory_btn": "Tiefes Gedächtnis speichern",
    
    // Session loading
    "load_saved_session_title": "Gespeicherte Sitzung laden",
    "select_session_label": "Wählen Sie eine gespeicherte Sitzung",
    "select_session_placeholder": "Wählen Sie eine Sitzung zum Fortsetzen...",
    "load_api_key_label": "API-Schlüssel (falls abweichend vom Original)",
    "load_api_key_placeholder": "API-Schlüssel eingeben, falls erforderlich",
    "load_model_label": "Modell (optional)",
    "use_original_model": "Ursprüngliches Modell verwenden",
    "load_model_help": "Wählen Sie ein anderes Modell oder belassen Sie es beim Original.",
    
    // Memory panel
    "memory_system_title": "Gedächtnissystem",
    "short_term_label": "Kurzzeit",
    "long_term_label": "Langzeit",
    "deep_memory_panel_label": "Tiefes Gedächtnis",
    "stats_label": "Statistiken",
    "current_deep_memory": "Aktuelles tiefes Gedächtnis:",
    
    // Compression panel
    "memory_compression_title": "Gedächtniskompression",
    "enabled_label": "Aktiviert",
    "api_calls_since_compression": "API-Aufrufe seit letzter Kompression:",
    "last_compression": "Letzte Kompression:",
    "never": "Nie",
    "compression_count": "Kompressionsanzahl:",
    "last_reduction": "Letzte Reduzierung:",
    
    // Chat UI
    "welcome_title": "Willkommen zu Ihrer Simulation",
    "welcome_text": "Ihr Gespräch wird hier angezeigt. Beginnen Sie, indem Sie sich vorstellen oder eine Frage stellen.",
    "message_placeholder": "Geben Sie Ihre Nachricht ein... (Umschalt+Enter für neue Zeile)",
    
    // System messages
    "session_loaded": "Sitzung geladen! Setzen Sie Ihr Gespräch mit",
    "connected": "Verbunden!",
    "memory_compressed": "Gedächtnis komprimiert:",
    "compression_skipped": "Kompression übersprungen:",
    "last_saved": "Zuletzt gespeichert:",

    // Character Browser
    "character_browser_btn": "Charakterübersicht",
    "character_browser_title": "Charakterübersicht",
    "character_search_placeholder": "Suche nach Name, Aussehen, Persönlichkeit, Themen...",
    "select_character_btn": "Charakter auswählen",
    "previous_chats_btn": "Frühere Chats",
    "previous_chats_title": "Frühere Chats"
  }
};

// Export the localization object
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { localization };
} else {
  // For browser use
  window.localization = localization;
}