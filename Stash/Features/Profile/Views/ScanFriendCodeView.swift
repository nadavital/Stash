import SwiftUI
import AVFoundation
import Combine

/// Camera scanner for QR codes (like Snapchat)
/// Scans friend codes and instantly adds them
struct ScanFriendCodeView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var scanner = QRCodeScanner()

    @State private var showingSuccess = false
    @State private var scannedFriendName: String?

    var body: some View {
        ZStack {
            // Camera preview
            QRCodeScannerView(scanner: scanner) { result in
                handleScannedCode(result)
            }
            .ignoresSafeArea()

            // Overlay UI
            VStack {
                // Top bar
                HStack {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(width: 44, height: 44)
                            .background(.ultraThinMaterial)
                            .clipShape(Circle())
                    }

                    Spacer()
                }
                .padding()

                Spacer()

                // Scanning frame
                VStack(spacing: 16) {
                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .strokeBorder(.white, lineWidth: 3)
                        .frame(width: 250, height: 250)
                        .overlay(
                            // Corner accents
                            GeometryReader { geo in
                                ZStack {
                                    // Top-left
                                    Path { path in
                                        path.move(to: CGPoint(x: 0, y: 30))
                                        path.addLine(to: CGPoint(x: 0, y: 0))
                                        path.addLine(to: CGPoint(x: 30, y: 0))
                                    }
                                    .stroke(.white, lineWidth: 6)

                                    // Top-right
                                    Path { path in
                                        path.move(to: CGPoint(x: geo.size.width - 30, y: 0))
                                        path.addLine(to: CGPoint(x: geo.size.width, y: 0))
                                        path.addLine(to: CGPoint(x: geo.size.width, y: 30))
                                    }
                                    .stroke(.white, lineWidth: 6)

                                    // Bottom-left
                                    Path { path in
                                        path.move(to: CGPoint(x: 0, y: geo.size.height - 30))
                                        path.addLine(to: CGPoint(x: 0, y: geo.size.height))
                                        path.addLine(to: CGPoint(x: 30, y: geo.size.height))
                                    }
                                    .stroke(.white, lineWidth: 6)

                                    // Bottom-right
                                    Path { path in
                                        path.move(to: CGPoint(x: geo.size.width - 30, y: geo.size.height))
                                        path.addLine(to: CGPoint(x: geo.size.width, y: geo.size.height))
                                        path.addLine(to: CGPoint(x: geo.size.width, y: geo.size.height - 30))
                                    }
                                    .stroke(.white, lineWidth: 6)
                                }
                            }
                        )

                    Text("Point camera at QR code")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 10)
                        .background(.ultraThinMaterial)
                        .clipShape(Capsule())
                }

                Spacer()
            }

            // Success overlay
            if showingSuccess {
                successOverlay
            }
        }
        .onAppear {
            scanner.startScanning()
        }
        .onDisappear {
            scanner.stopScanning()
        }
    }

    // MARK: - Success Overlay

    private var successOverlay: some View {
        ZStack {
            Color.black.opacity(0.9)
                .ignoresSafeArea()

            VStack(spacing: 24) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 80))
                    .foregroundStyle(.green)

                Text("Friend Added!")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundStyle(.white)

                if let name = scannedFriendName {
                    Text("You're now friends with \(name)")
                        .font(.system(size: 16))
                        .foregroundStyle(.secondary)
                }

                Button {
                    dismiss()
                } label: {
                    Text("Done")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(StashTheme.Color.accent)
                        .clipShape(Capsule())
                }
                .padding(.horizontal, 40)
                .padding(.top, 16)
            }
            .padding()
        }
    }

    // MARK: - Handle Scanned Code

    private func handleScannedCode(_ code: String) {
        // Parse deep link: stash://add-friend/{userId}
        guard code.hasPrefix("stash://add-friend/") else {
            // Invalid QR code
            return
        }

        let friendId = code.replacingOccurrences(of: "stash://add-friend/", with: "")

        // TODO: Call backend to add friend
        // For now, just show success
        Haptics.success()
        scanner.stopScanning()

        withAnimation(.spring(response: 0.4)) {
            scannedFriendName = "Friend" // TODO: Get actual name from backend
            showingSuccess = true
        }

        // Auto-dismiss after 2 seconds
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            dismiss()
        }
    }
}

// MARK: - QR Code Scanner

@MainActor
@Observable
class QRCodeScanner: NSObject, AVCaptureMetadataOutputObjectsDelegate {
    var scannedCode: String?
    var isScanning = false

    private let session = AVCaptureSession()
    private let metadataOutput = AVCaptureMetadataOutput()
    var onCodeScanned: ((String) -> Void)?

    func startScanning() {
        guard !isScanning else { return }

        Task {
            await setupCamera()
            session.startRunning()
            isScanning = true
        }
    }

    func stopScanning() {
        session.stopRunning()
        isScanning = false
    }

    private func setupCamera() async {
        guard let device = AVCaptureDevice.default(for: .video) else { return }

        do {
            let input = try AVCaptureDeviceInput(device: device)

            if session.canAddInput(input) {
                session.addInput(input)
            }

            if session.canAddOutput(metadataOutput) {
                session.addOutput(metadataOutput)
                metadataOutput.setMetadataObjectsDelegate(self, queue: .main)
                metadataOutput.metadataObjectTypes = [.qr]
            }
        } catch {
            print("Failed to setup camera: \(error)")
        }
    }

    nonisolated func metadataOutput(
        _ output: AVCaptureMetadataOutput,
        didOutput metadataObjects: [AVMetadataObject],
        from connection: AVCaptureConnection
    ) {
        guard let metadataObject = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
              let stringValue = metadataObject.stringValue else { return }

        Task { @MainActor in
            if isScanning {
                scannedCode = stringValue
                onCodeScanned?(stringValue)
            }
        }
    }

    func getPreviewLayer() -> AVCaptureVideoPreviewLayer {
        let previewLayer = AVCaptureVideoPreviewLayer(session: session)
        previewLayer.videoGravity = .resizeAspectFill
        return previewLayer
    }
}

// MARK: - Scanner View Representable

struct QRCodeScannerView: UIViewRepresentable {
    let scanner: QRCodeScanner
    let onCodeScanned: (String) -> Void

    func makeUIView(context: Context) -> UIView {
        let view = UIView(frame: .zero)
        view.backgroundColor = .black

        let previewLayer = scanner.getPreviewLayer()
        previewLayer.frame = view.bounds
        view.layer.addSublayer(previewLayer)

        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        if let previewLayer = uiView.layer.sublayers?.first as? AVCaptureVideoPreviewLayer {
            previewLayer.frame = uiView.bounds
        }

        // Set callback
        scanner.onCodeScanned = onCodeScanned
    }
}

// MARK: - Preview

#Preview {
    ScanFriendCodeView()
}
