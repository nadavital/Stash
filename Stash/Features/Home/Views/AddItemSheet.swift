import SwiftUI
import PhotosUI

/// Modal sheet for adding items to Stash
/// Two-screen flow: Options → URL Input OR Image Picker
struct AddItemSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel = AddItemViewModel()
    @State private var showingURLInput = false
    @State private var showingImagePicker = false
    @State private var selectedPhotoItem: PhotosPickerItem?
    @State private var showingSuccess = false
    @State private var successTitle: String?

    var body: some View {
        NavigationStack {
            ZStack {
                if !showingURLInput {
                    AddItemOptionsView(
                        onSelectURL: { showingURLInput = true },
                        onSelectImage: { showingImagePicker = true }
                    )
                    .navigationTitle("Add to Stash")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cancel") { dismiss() }
                        }
                    }
                    .photosPicker(
                        isPresented: $showingImagePicker,
                        selection: $selectedPhotoItem,
                        matching: .images
                    )
                    .onChange(of: selectedPhotoItem) { _, newItem in
                        handleImageSelection(newItem)
                    }
                } else {
                    URLInputView(viewModel: viewModel, onSave: handleSave)
                        .navigationTitle("Paste URL")
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar {
                            ToolbarItem(placement: .cancellationAction) {
                                Button("Back") { showingURLInput = false }
                            }
                        }
                }

                // Loading overlay
                if viewModel.isLoading {
                    LoadingOverlay(
                        progressMessage: viewModel.progressMessage,
                        startTime: viewModel.loadingStartTime
                    )
                }

                // Success confirmation
                if showingSuccess, let title = successTitle {
                    SuccessOverlay(title: title)
                }
            }
        }
    }

    private func handleSave() {
        Task {
            let success = await viewModel.saveURL()
            if success {
                Haptics.success()
                successTitle = viewModel.successTitle
                withAnimation(.spring(duration: 0.3)) {
                    showingSuccess = true
                }
                try? await Task.sleep(nanoseconds: 1_500_000_000) // 1.5s to show success
                dismiss()
            }
        }
    }

    private func handleImageSelection(_ item: PhotosPickerItem?) {
        guard let item else { return }

        Task {
            if let data = try? await item.loadTransferable(type: Data.self) {
                let success = await viewModel.saveImage(imageData: data)
                if success {
                    Haptics.success()
                    successTitle = viewModel.successTitle
                    withAnimation(.spring(duration: 0.3)) {
                        showingSuccess = true
                    }
                    try? await Task.sleep(nanoseconds: 1_500_000_000) // 1.5s to show success
                    dismiss()
                }
            } else {
                viewModel.errorMessage = "Failed to load image"
                Haptics.error()
            }
        }
    }
}

// MARK: - Options View

struct AddItemOptionsView: View {
    let onSelectURL: () -> Void
    let onSelectImage: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            OptionCard(
                icon: "link",
                title: "Paste URL",
                subtitle: "Save from a web link",
                action: onSelectURL
            )

            OptionCard(
                icon: "photo",
                title: "From Image",
                subtitle: "Analyze a screenshot",
                action: onSelectImage
            )
        }
        .padding()
    }
}

// MARK: - Option Card

struct OptionCard: View {
    let icon: String
    let title: String
    let subtitle: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 24))
                    .foregroundStyle(StashTheme.Color.accent)
                    .frame(width: 44, height: 44)

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.body.weight(.medium))
                        .foregroundStyle(.primary)

                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.tertiary)
            }
            .padding()
            .background(Color.gray.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - URL Input View

struct URLInputView: View {
    @Bindable var viewModel: AddItemViewModel
    @FocusState private var isInputFocused: Bool
    let onSave: () -> Void

    var body: some View {
        VStack(spacing: 24) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Enter or paste a URL")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                HStack(spacing: 8) {
                    TextField("https://...", text: $viewModel.urlText)
                        .textFieldStyle(.roundedBorder)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                        .focused($isInputFocused)
                        .onSubmit(onSave)

                    Button {
                        viewModel.pasteFromClipboard()
                    } label: {
                        Image(systemName: "doc.on.clipboard")
                            .font(.system(size: 16))
                    }
                    .glassEffect(.regular, in: .rect(cornerRadius: 8))
                    .frame(width: 44, height: 44)
                }
            }

            if let error = viewModel.errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(StashTheme.Color.danger)
            }

            Button {
                onSave()
            } label: {
                if viewModel.isLoading {
                    ProgressView()
                        .progressViewStyle(.circular)
                        .tint(.white)
                } else {
                    Text("Save")
                        .font(.body.weight(.semibold))
                }
            }
            .glassEffect(.regular.tint(StashTheme.Color.accent).interactive(), in: .rect(cornerRadius: 999))
            .frame(height: 52)
            .frame(maxWidth: .infinity)
            .disabled(viewModel.urlText.isEmpty || viewModel.isLoading)

            Spacer()
        }
        .padding()
        .onAppear {
            isInputFocused = true
        }
    }
}

// MARK: - Loading Overlay

struct LoadingOverlay: View {
    let progressMessage: String
    let startTime: Date

    @State private var currentMessage: String

    init(progressMessage: String, startTime: Date) {
        self.progressMessage = progressMessage
        self.startTime = startTime
        _currentMessage = State(initialValue: progressMessage)
    }

    var body: some View {
        ZStack {
            Color.black.opacity(0.3)
                .ignoresSafeArea()

            VStack(spacing: 16) {
                ProgressView()
                    .progressViewStyle(.circular)
                    .tint(StashTheme.Color.accent)
                    .scaleEffect(1.2)

                Text(currentMessage)
                    .font(.body)
                    .foregroundStyle(.secondary)
            }
            .padding(24)
            .background(Color.gray.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .shadow(color: .black.opacity(0.1), radius: 8)
            .padding()
        }
        .transition(.opacity)
        .onAppear {
            startProgressUpdates()
        }
    }

    private func startProgressUpdates() {
        Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { timer in
            let elapsed = Date().timeIntervalSince(startTime)

            if elapsed < 2 {
                currentMessage = "Analyzing content..."
            } else if elapsed < 4 {
                currentMessage = "Generating summary..."
            } else if elapsed < 7 {
                currentMessage = "Almost there..."
            } else {
                currentMessage = "Finishing up..."
            }
        }
    }
}

// MARK: - Success Overlay

struct SuccessOverlay: View {
    let title: String

    var body: some View {
        ZStack {
            Color.black.opacity(0.3)
                .ignoresSafeArea()

            VStack(spacing: 12) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 48))
                    .foregroundStyle(StashTheme.Color.success)

                VStack(spacing: 4) {
                    Text("Saved!")
                        .font(.headline)
                        .foregroundStyle(.primary)

                    Text(title)
                        .font(.body)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                }
            }
            .padding(24)
            .background(Color.gray.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .shadow(color: .black.opacity(0.1), radius: 8)
            .padding()
        }
        .transition(.scale.combined(with: .opacity))
    }
}

// MARK: - Preview

#Preview("Options") {
    AddItemSheet()
}

#Preview("URL Input") {
    NavigationStack {
        URLInputView(viewModel: AddItemViewModel()) {
            print("Save tapped")
        }
        .navigationTitle("Paste URL")
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview("Loading") {
    LoadingOverlay(progressMessage: "Analyzing content...", startTime: Date())
}

#Preview("Success") {
    SuccessOverlay(title: "Building a Modern iOS App with SwiftUI")
}
