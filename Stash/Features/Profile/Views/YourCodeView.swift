import SwiftUI
import CoreImage.CIFilterBuiltins

/// Scannable QR code for instant friend adds (like Snapchat)
/// Shows user's code and allows scanning friend's code
struct YourCodeView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var authManager = AuthManager.shared

    @State private var selectedTab: Tab = .yourCode
    @State private var showingScanner = false

    enum Tab: String, CaseIterable {
        case yourCode = "Your Code"
        case scanCode = "Scan Code"
    }

    var body: some View {
        NavigationStack {
            ZStack {
                StashTheme.Color.bg.ignoresSafeArea()

                VStack(spacing: 0) {
                    // Tab picker
                    Picker("", selection: $selectedTab) {
                        ForEach(Tab.allCases, id: \.self) { tab in
                            Text(tab.rawValue).tag(tab)
                        }
                    }
                    .pickerStyle(.segmented)
                    .padding()

                    // Content
                    TabView(selection: $selectedTab) {
                        yourCodeContent
                            .tag(Tab.yourCode)

                        scanCodeContent
                            .tag(Tab.scanCode)
                    }
                    .tabViewStyle(.page(indexDisplayMode: .never))
                }
            }
            .navigationTitle("Friend Code")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
            .sheet(isPresented: $showingScanner) {
                ScanFriendCodeView()
            }
        }
    }

    // MARK: - Your Code Content

    private var yourCodeContent: some View {
        ScrollView {
            VStack(spacing: 24) {
                Text("Have your friend scan this code to add you instantly")
                    .font(.system(size: 15))
                    .foregroundStyle(StashTheme.Color.textSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)

                // QR Code
                if let qrImage = generateQRCode() {
                    VStack(spacing: 20) {
                        // QR code with glass background
                        ZStack {
                            RoundedRectangle(cornerRadius: 24, style: .continuous)
                                .fill(.white)
                                .shadow(color: .black.opacity(0.1), radius: 20, y: 10)

                            VStack(spacing: 16) {
                                // User avatar
                                Circle()
                                    .fill(
                                        LinearGradient(
                                            colors: [StashTheme.Color.accent, StashTheme.Color.accent.opacity(0.6)],
                                            startPoint: .topLeading,
                                            endPoint: .bottomTrailing
                                        )
                                    )
                                    .frame(width: 50, height: 50)
                                    .overlay(
                                        Text(authManager.userHandle?.prefix(1).uppercased() ?? "?")
                                            .font(.system(size: 22, weight: .bold))
                                            .foregroundStyle(.white)
                                    )

                                // QR code image
                                Image(uiImage: qrImage)
                                    .interpolation(.none)
                                    .resizable()
                                    .scaledToFit()
                                    .frame(width: 220, height: 220)

                                // Handle
                                if let handle = authManager.userHandle {
                                    Text("@\(handle)")
                                        .font(.system(size: 18, weight: .semibold))
                                        .foregroundStyle(.black)
                                }
                            }
                            .padding(32)
                        }
                        .frame(width: 300, height: 350)
                    }
                    .padding(.vertical)
                } else {
                    Text("Unable to generate code")
                        .foregroundStyle(StashTheme.Color.textMuted)
                        .padding()
                }

                // Instructions
                VStack(spacing: 12) {
                    InstructionRow(
                        number: 1,
                        text: "Have your friend open Stash and tap their profile"
                    )
                    InstructionRow(
                        number: 2,
                        text: "Tap \"Scan Code\" and point their camera at this code"
                    )
                    InstructionRow(
                        number: 3,
                        text: "You'll be added as friends instantly!"
                    )
                }
                .padding(.horizontal)
                .padding(.bottom, 32)
            }
            .padding(.top)
        }
    }

    // MARK: - Scan Code Content

    private var scanCodeContent: some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: "qrcode.viewfinder")
                .font(.system(size: 80, weight: .light))
                .foregroundStyle(StashTheme.Color.accent)

            Text("Scan a friend's code")
                .font(.system(size: 24, weight: .bold))
                .foregroundStyle(StashTheme.Color.textPrimary)

            Text("Point your camera at their QR code to add them instantly")
                .font(.system(size: 15))
                .foregroundStyle(StashTheme.Color.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)

            Button {
                Haptics.medium()
                showingScanner = true
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "camera")
                        .font(.system(size: 16, weight: .semibold))
                    Text("Open Camera")
                        .font(.system(size: 16, weight: .semibold))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 32)
                .padding(.vertical, 16)
                .background(StashTheme.Color.accent)
                .clipShape(Capsule())
            }
            .padding(.top, 8)

            Spacer()
        }
    }

    // MARK: - QR Code Generation

    private func generateQRCode() -> UIImage? {
        guard let userId = authManager.userId else { return nil }

        // Create QR code data (deep link format)
        let qrContent = "stash://add-friend/\(userId)"

        let context = CIContext()
        let filter = CIFilter.qrCodeGenerator()

        guard let data = qrContent.data(using: .utf8) else { return nil }

        filter.setValue(data, forKey: "inputMessage")
        filter.setValue("H", forKey: "inputCorrectionLevel")

        guard let outputImage = filter.outputImage else { return nil }

        // Scale up the QR code
        let transform = CGAffineTransform(scaleX: 10, y: 10)
        let scaledImage = outputImage.transformed(by: transform)

        guard let cgImage = context.createCGImage(scaledImage, from: scaledImage.extent) else {
            return nil
        }

        return UIImage(cgImage: cgImage)
    }
}

// MARK: - Instruction Row

struct InstructionRow: View {
    let number: Int
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Text("\(number)")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 28, height: 28)
                .background(StashTheme.Color.accent)
                .clipShape(Circle())

            Text(text)
                .font(.system(size: 15))
                .foregroundStyle(StashTheme.Color.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

// MARK: - Preview

#Preview {
    YourCodeView()
}
