import Foundation

/// Environment configuration for the Stash app
enum AppEnvironment {
    /// Supabase project URL
    static let supabaseURL = "https://sneedssdvfdzxzklenre.supabase.co"

    /// Supabase anonymous (public) key
    static let supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNuZWVkc3NkdmZkenh6a2xlbnJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxODAyOTgsImV4cCI6MjA3OTc1NjI5OH0.OV09FsknP73l1pOie8SY3-vLuNhw18ozcAxbtVIGaqo"

    // TODO: Before running the app:
    // 1. Create a Supabase project at https://supabase.com/dashboard
    // 2. Go to Project Settings → API
    // 3. Replace supabaseURL with your Project URL
    // 4. Replace supabaseAnonKey with your anon/public key
    //
    // Note: The anon key is safe to embed in the app - it only allows
    // access controlled by Row Level Security (RLS) policies
}
