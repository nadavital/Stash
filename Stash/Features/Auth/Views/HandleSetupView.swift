import SwiftUI

/// View for setting up user handle after signup
struct HandleSetupView: View {
    @StateObject private var viewModel = HandleSetupViewModel()
    @State private var handle = ""

    var body: some View {
        ZStack {
            // Background
            Color(hex: "F7F9FC")
                .ignoresSafeArea()

            VStack(spacing: 32) {
                Spacer()

                // Header
                VStack(spacing: 16) {
                    Text("👋")
                        .font(.system(size: 80))

                    Text("Welcome to Stash!")
                        .font(.system(size: 32, weight: .bold, design: .rounded))
                        .foregroundColor(.primary)

                    Text("Choose your unique handle")
                        .font(.system(size: 18, weight: .medium))
                        .foregroundColor(.secondary)
                }

                // Handle input
                VStack(spacing: 12) {
                    HStack(spacing: 8) {
                        Text("@")
                            .font(.system(size: 24, weight: .semibold))
                            .foregroundColor(.secondary)

                        TextField("yourhandle", text: $handle)
                            .textContentType(.username)
                            .autocapitalization(.none)
                            .font(.system(size: 24, weight: .medium))
                            .onChange(of: handle) { oldValue, newValue in
                                // Only allow alphanumeric and underscore
                                let filtered = newValue.filter { $0.isLetter || $0.isNumber || $0 == "_" }
                                if filtered != newValue {
                                    handle = filtered
                                }
                                // Check availability
                                if filtered.count >= 3 {
                                    Task {
                                        await viewModel.checkAvailability(handle: filtered)
                                    }
                                }
                            }
                    }
                    .padding()
                    .background(Color.white)
                    .cornerRadius(12)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(viewModel.isAvailable == true ? Color.green : Color.gray.opacity(0.3), lineWidth: 2)
                    )

                    // Availability indicator
                    if viewModel.isChecking {
                        HStack {
                            ProgressView()
                                .controlSize(.small)
                            Text("Checking availability...")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    } else if let isAvailable = viewModel.isAvailable {
                        HStack {
                            Image(systemName: isAvailable ? "checkmark.circle.fill" : "xmark.circle.fill")
                                .foregroundColor(isAvailable ? .green : .red)
                            Text(isAvailable ? "@\(handle) is available!" : "@\(handle) is taken")
                                .font(.caption)
                                .foregroundColor(isAvailable ? .green : .red)
                        }
                    } else if handle.count > 0 && handle.count < 3 {
                        Text("Handle must be at least 3 characters")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }

                    // Error message
                    if let error = viewModel.errorMessage {
                        Text(error)
                            .font(.caption)
                            .foregroundColor(.red)
                            .multilineTextAlignment(.center)
                    }
                }
                .padding(.horizontal, 32)

                // Continue button
                Button(action: {
                    Task {
                        await viewModel.setHandle(handle: handle)
                    }
                }) {
                    HStack {
                        if viewModel.isLoading {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle(tint: .white))
                        } else {
                            Text("Continue")
                                .font(.system(size: 18, weight: .semibold))
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color(hex: "667eea"))
                    .foregroundColor(.white)
                    .cornerRadius(12)
                }
                .disabled(!canContinue)
                .opacity(canContinue ? 1.0 : 0.5)
                .padding(.horizontal, 32)

                Spacer()
            }
        }
    }

    private var canContinue: Bool {
        !viewModel.isLoading &&
        !viewModel.isChecking &&
        viewModel.isAvailable == true &&
        handle.count >= 3
    }
}

#Preview {
    HandleSetupView()
}
