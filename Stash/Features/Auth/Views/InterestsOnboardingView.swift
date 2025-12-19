import SwiftUI

/// View for onboarding users with their interests
struct InterestsOnboardingView: View {
    @StateObject private var viewModel = InterestsOnboardingViewModel()
    @FocusState private var isInputFocused: Bool

    // Example interests to inspire users
    private let exampleInterests = [
        "indie music, cooking, AI",
        "basketball, tech startups, podcasts",
        "travel, photography, recipes",
        "hip-hop, design, reading",
    ]

    var body: some View {
        VStack(spacing: 0) {
                Spacer()

                // Header
                VStack(spacing: 20) {
                    // AI brain icon with glow
                    ZStack {
                        Circle()
                            .fill(StashTheme.Color.aiSoft)
                            .frame(width: 100, height: 100)

                        Image(systemName: "brain.head.profile")
                            .font(.system(size: 50))
                            .foregroundColor(StashTheme.Color.ai)
                    }

                    Text("What are you into?")
                        .font(.system(size: 32, weight: .bold))
                        .foregroundColor(.primary)

                    Text("Tell Stash about your interests so we can personalize your experience")
                        .font(.body)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 40)
                }

                Spacer()
                    .frame(height: 40)

                // Interest input
                VStack(alignment: .leading, spacing: 16) {
                    // Text editor for free-form input
                    ZStack(alignment: .topLeading) {
                        if viewModel.interestsText.isEmpty {
                            Text("e.g., \(exampleInterests.randomElement() ?? "indie music, cooking, AI")...")
                                .font(.body)
                                .foregroundStyle(.tertiary)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 14)
                        }

                        TextEditor(text: $viewModel.interestsText)
                            .font(.body)
                            .foregroundColor(.primary)
                            .scrollContentBackground(.hidden)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .focused($isInputFocused)
                    }
                    .frame(height: 120)
                    .background(Color.gray.opacity(0.08))
                    .cornerRadius(16)
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(
                                isInputFocused ? AnyShapeStyle(StashTheme.Color.ai) : AnyShapeStyle(.quaternary),
                                lineWidth: isInputFocused ? 2 : 1
                            )
                    )

                    // Suggestions
                    Text("Try describing topics, genres, hobbies, or anything you love")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
                .padding(.horizontal, 24)

                Spacer()

                // Buttons
                VStack(spacing: 16) {
                    // Continue button
                    Button(action: {
                        Task {
                            await viewModel.submitInterests()
                        }
                    }) {
                        HStack {
                            if viewModel.isLoading {
                                ProgressView()
                                    .progressViewStyle(CircularProgressViewStyle(tint: .primary))
                            } else {
                                Text("Continue")
                                    .font(.body.weight(.semibold))
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(canContinue ? StashTheme.Color.accent : Color.gray.opacity(0.2))
                        .foregroundStyle(canContinue ? Color.white : Color.gray)
                        .cornerRadius(999)
                    }
                    .disabled(!canContinue)

                    // Skip button
                    Button(action: {
                        viewModel.skipOnboarding()
                    }) {
                        Text("Skip for now")
                            .font(.body)
                            .foregroundColor(.secondary)
                    }
                    .disabled(viewModel.isLoading)
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 40)
        }
        .onTapGesture {
            isInputFocused = false
        }
        .alert("Error", isPresented: .constant(viewModel.errorMessage != nil)) {
            Button("OK") {
                viewModel.errorMessage = nil
            }
        } message: {
            Text(viewModel.errorMessage ?? "")
        }
    }

    private var canContinue: Bool {
        !viewModel.isLoading && viewModel.interestsText.trimmingCharacters(in: .whitespacesAndNewlines).count >= 3
    }
}

#Preview {
    InterestsOnboardingView()
}
