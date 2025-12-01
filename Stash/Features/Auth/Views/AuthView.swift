import SwiftUI

/// Main authentication view with login/signup
struct AuthView: View {
    @StateObject private var viewModel = AuthViewModel()
    @State private var isSignupMode = false
    @State private var showPassword = false

    var body: some View {
        ZStack {
            // Background gradient
            LinearGradient(
                colors: [Color(hex: "667eea"), Color(hex: "764ba2")],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 32) {
                Spacer()

                // Logo and title
                VStack(spacing: 16) {
                    Text("📦")
                        .font(.system(size: 80))

                    Text("Stash")
                        .font(.system(size: 48, weight: .bold, design: .rounded))
                        .foregroundColor(.white)

                    Text("Your AI-powered\ncontent companion")
                        .font(.system(size: 18, weight: .medium))
                        .foregroundColor(.white.opacity(0.9))
                        .multilineTextAlignment(.center)
                }

                Spacer()

                // Auth form
                VStack(spacing: 16) {
                    // Email field
                    TextField("Email", text: $viewModel.email)
                        .textContentType(.emailAddress)
                        .autocapitalization(.none)
                        .keyboardType(.emailAddress)
                        .padding()
                        .background(Color.white.opacity(0.9))
                        .cornerRadius(12)
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(Color.white, lineWidth: 2)
                        )

                    // Password field
                    ZStack(alignment: .trailing) {
                        Group {
                            if showPassword {
                                TextField("Password", text: $viewModel.password)
                                    .textContentType(isSignupMode ? .newPassword : .password)
                            } else {
                                SecureField("Password", text: $viewModel.password)
                                    .textContentType(isSignupMode ? .newPassword : .password)
                            }
                        }
                        .padding()
                        .padding(.trailing, 40)

                        Button(action: {
                            showPassword.toggle()
                        }) {
                            Image(systemName: showPassword ? "eye.slash.fill" : "eye.fill")
                                .foregroundColor(Color(hex: "667eea"))
                                .padding(.trailing, 12)
                        }
                    }
                    .background(Color.white.opacity(0.9))
                    .cornerRadius(12)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(Color.white, lineWidth: 2)
                    )

                    // Error message
                    if let error = viewModel.errorMessage {
                        Text(error)
                            .font(.caption)
                            .foregroundColor(.red)
                            .padding(.horizontal)
                            .multilineTextAlignment(.center)
                    }

                    // Submit button
                    Button(action: {
                        Task {
                            if isSignupMode {
                                await viewModel.signUp()
                            } else {
                                await viewModel.signIn()
                            }
                        }
                    }) {
                        HStack {
                            if viewModel.isLoading {
                                ProgressView()
                                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                            } else {
                                Text(isSignupMode ? "Sign Up" : "Sign In")
                                    .font(.system(size: 18, weight: .semibold))
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.white)
                        .foregroundColor(Color(hex: "667eea"))
                        .cornerRadius(12)
                    }
                    .disabled(viewModel.isLoading || viewModel.email.isEmpty || viewModel.password.isEmpty)
                    .opacity(viewModel.email.isEmpty || viewModel.password.isEmpty ? 0.5 : 1.0)

                    // Toggle mode button
                    Button(action: {
                        isSignupMode.toggle()
                        viewModel.errorMessage = nil
                    }) {
                        Text(isSignupMode ? "Already have an account? Sign In" : "Don't have an account? Sign Up")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(.white)
                    }
                    .padding(.top, 8)
                }
                .padding(.horizontal, 32)

                Spacer()
            }
        }
    }
}

#Preview {
    AuthView()
}
