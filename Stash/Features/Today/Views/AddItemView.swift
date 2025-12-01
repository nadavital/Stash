import SwiftUI
import Combine

/// Sheet for adding a new item to stash
struct AddItemView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel = AddItemViewModel()

    @State private var urlText = ""
    @State private var note = ""
    @State private var showSuccess = false

    var body: some View {
        NavigationStack {
            ZStack {
                StashTheme.Color.bg.ignoresSafeArea()

                VStack(spacing: StashSpacing.sectionVertical) {
                    // URL Input
                    VStack(alignment: .leading, spacing: 8) {
                        Text("URL")
                            .font(StashTypography.body)
                            .fontWeight(.medium)
                            .foregroundColor(StashTheme.Color.textSecondary)

                        TextField("Paste a link here", text: $urlText)
                            .textFieldStyle(.plain)
                            .font(StashTypography.body)
                            .foregroundColor(StashTheme.Color.textPrimary)
                            .padding()
                            .background(StashTheme.Color.surfaceSoft)
                            .cornerRadius(StashTheme.Radius.card)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .keyboardType(.URL)
                    }

                    // Optional Note
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Note (Optional)")
                            .font(StashTypography.body)
                            .fontWeight(.medium)
                            .foregroundColor(StashTheme.Color.textSecondary)

                        TextField("Add a note...", text: $note, axis: .vertical)
                            .textFieldStyle(.plain)
                            .font(StashTypography.body)
                            .foregroundColor(StashTheme.Color.textPrimary)
                            .padding()
                            .background(StashTheme.Color.surfaceSoft)
                            .cornerRadius(StashTheme.Radius.card)
                            .lineLimit(3...6)
                    }

                    Spacer()

                    // Status message
                    if viewModel.isLoading {
                        HStack(spacing: 12) {
                            ProgressView()
                            Text("Saving to your stash...")
                                .font(StashTypography.body)
                                .foregroundColor(StashTheme.Color.textSecondary)
                        }
                        .padding()
                    } else if let error = viewModel.error {
                        Text(error.localizedDescription)
                            .font(StashTypography.body)
                            .foregroundColor(StashTheme.Color.danger)
                            .multilineTextAlignment(.center)
                            .padding()
                    }
                }
                .padding(StashSpacing.screenHorizontal)
                
                // Success overlay
                if showSuccess {
                    SaveSuccessOverlay()
                        .transition(.opacity.combined(with: .scale))
                }
            }
            .navigationTitle("Add to Stash")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                    .foregroundColor(StashTheme.Color.textSecondary)
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            await saveItem()
                        }
                    }
                    .foregroundColor(StashTheme.Color.accent)
                    .disabled(urlText.trimmingCharacters(in: .whitespaces).isEmpty || viewModel.isLoading)
                }
            }
        }
    }

    private func saveItem() async {
        let trimmedURL = urlText.trimmingCharacters(in: .whitespaces)
        let trimmedNote = note.trimmingCharacters(in: .whitespaces)

        let success = await viewModel.createItem(
            url: trimmedURL,
            note: trimmedNote.isEmpty ? nil : trimmedNote
        )

        if success {
            // Show success animation
            withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) {
                showSuccess = true
            }
            
            // Dismiss after a short delay
            try? await Task.sleep(nanoseconds: 800_000_000)
            dismiss()
        }
    }
}

/// Success overlay shown after saving
struct SaveSuccessOverlay: View {
    @State private var scale: CGFloat = 0.5
    @State private var opacity: Double = 0
    
    var body: some View {
        ZStack {
            // Dimmed background
            Color.black.opacity(0.3)
                .ignoresSafeArea()
            
            // Success card
            VStack(spacing: 16) {
                // Checkmark with circle
                ZStack {
                    Circle()
                        .fill(StashTheme.Color.accent.opacity(0.15))
                        .frame(width: 80, height: 80)
                    
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 50))
                        .foregroundColor(StashTheme.Color.accent)
                }
                
                Text("Saved to Stash!")
                    .font(StashTypography.pageTitle)
                    .foregroundColor(StashTheme.Color.textPrimary)
                
                Text("We're enriching it now")
                    .font(StashTypography.body)
                    .foregroundColor(StashTheme.Color.textSecondary)
            }
            .padding(32)
            .background(StashTheme.Color.surface)
            .cornerRadius(StashTheme.Radius.card)
            .shadow(color: .black.opacity(0.15), radius: 20, y: 10)
            .scaleEffect(scale)
            .opacity(opacity)
        }
        .onAppear {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) {
                scale = 1
                opacity = 1
            }
        }
    }
}

/// ViewModel for adding items
@MainActor
class AddItemViewModel: ObservableObject {
    @Published var isLoading = false
    @Published var error: Error?

    private let apiClient = APIClient.shared

    /// Create a new stash item
    func createItem(url: String, note: String?) async -> Bool {
        isLoading = true
        error = nil

        do {
            print("🔵 Creating item with URL: \(url)")
            let response = try await apiClient.createItem(url: url, note: note)
            print("🟢 Item created: \(response.itemId), status: \(response.status)")
            isLoading = false
            return true
        } catch {
            print("🔴 Error creating item: \(error)")
            self.error = error
            isLoading = false
            return false
        }
    }
}

#Preview {
    AddItemView()
}
