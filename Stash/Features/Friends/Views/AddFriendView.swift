import SwiftUI

/// Sheet for adding a friend by handle
struct AddFriendView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var handle = ""
    @State private var isLoading = false
    @State private var error: Error?
    @State private var success = false

    private let apiClient = APIClient.shared

    var body: some View {
        NavigationStack {
            ZStack {
                StashTheme.Color.bg.ignoresSafeArea()

                VStack(spacing: StashSpacing.sectionVertical) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Friend's Handle")
                            .font(StashTypography.body)
                            .fontWeight(.medium)
                            .foregroundColor(StashTheme.Color.textSecondary)

                        HStack {
                            Text("@")
                                .font(StashTypography.cardTitle)
                                .foregroundColor(StashTheme.Color.textSecondary)
                                .padding(.leading, 12)

                            TextField("username", text: $handle)
                                .textFieldStyle(.plain)
                                .font(StashTypography.body)
                                .foregroundColor(StashTheme.Color.textPrimary)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                        }
                        .padding(.vertical, 12)
                        .background(StashTheme.Color.surfaceSoft)
                        .cornerRadius(StashTheme.Radius.card)
                    }
                    .padding(.horizontal, StashSpacing.screenHorizontal)
                    .padding(.top)

                    if isLoading {
                        ProgressView("Adding friend...")
                            .foregroundColor(StashTheme.Color.textSecondary)
                            .padding()
                    }

                    if let error = error {
                        Text(error.localizedDescription)
                            .font(StashTypography.body)
                            .foregroundColor(StashTheme.Color.danger)
                            .multilineTextAlignment(.center)
                            .padding()
                    }

                    if success {
                        HStack(spacing: 12) {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundColor(StashTheme.Color.success)
                            Text("Friend added!")
                                .font(StashTypography.body)
                                .foregroundColor(StashTheme.Color.success)
                        }
                        .padding()
                    }

                    Spacer()
                }
            }
            .navigationTitle("Add Friend")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                    .foregroundColor(StashTheme.Color.textSecondary)
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        Task {
                            await addFriend()
                        }
                    }
                    .foregroundColor(StashTheme.Color.accent)
                    .disabled(handle.trimmingCharacters(in: .whitespaces).isEmpty || isLoading)
                }
            }
        }
    }

    private func addFriend() async {
        let trimmedHandle = handle.trimmingCharacters(in: .whitespaces)
        isLoading = true
        error = nil
        success = false

        do {
            _ = try await apiClient.addFriend(handle: trimmedHandle)
            success = true

            // Auto-dismiss after 1 second
            try await Task.sleep(nanoseconds: 1_000_000_000)
            dismiss()
        } catch {
            self.error = error
        }

        isLoading = false
    }
}

#Preview {
    AddFriendView()
}
