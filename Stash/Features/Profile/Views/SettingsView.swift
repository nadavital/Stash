import SwiftUI

/// Settings view for app preferences
/// TODO: Implement actual settings
struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section("Account") {
                    Text("Profile Settings")
                    Text("Privacy")
                    Text("Notifications")
                }

                Section("App") {
                    Text("Appearance")
                    Text("Storage")
                    Text("About")
                }

                Section {
                    Button("Sign Out", role: .destructive) {
                        // TODO: Implement sign out
                    }
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }
}

#Preview {
    SettingsView()
}
