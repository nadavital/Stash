import SwiftUI
import Combine

/// ViewModel for adding items to Stash via URL or image
@MainActor
@Observable
class AddItemViewModel {
    var urlText: String = ""
    var isLoading: Bool = false
    var errorMessage: String?
    var createdItemId: String?
    var loadingStartTime: Date = Date()
    var progressMessage: String = "Analyzing content..."
    var successTitle: String?

    private let apiClient = APIClient.shared

    // MARK: - Logging

    private func log(_ message: String) {
        let timestamp = ISO8601DateFormatter().string(from: Date())
        print("[\(timestamp)] [AddItem] \(message)")
    }

    /// Paste URL from clipboard
    func pasteFromClipboard() {
        if let clipboardString = UIPasteboard.general.string {
            urlText = clipboardString.trimmingCharacters(in: .whitespacesAndNewlines)
            Haptics.light()
        }
    }

    /// Validate URL format
    func validateURL() -> Bool {
        guard let url = URL(string: urlText),
              let scheme = url.scheme,
              ["http", "https"].contains(scheme),
              url.host != nil else {
            return false
        }
        return true
    }

    /// Save URL to Stash
    func saveURL() async -> Bool {
        log("🔗 Starting URL save: \(urlText)")

        guard validateURL() else {
            log("❌ URL validation failed: \(urlText)")
            errorMessage = "Please enter a valid URL"
            Haptics.error()
            return false
        }

        log("✅ URL validation passed")

        isLoading = true
        loadingStartTime = Date()
        errorMessage = nil
        progressMessage = "Analyzing content..."

        do {
            log("📤 Calling API to create item...")
            let response = try await apiClient.createItem(url: urlText)
            let duration = Date().timeIntervalSince(loadingStartTime)

            log("✅ Item created successfully - ID: \(response.itemId), Status: \(response.status), Duration: \(String(format: "%.2f", duration))s")

            createdItemId = response.itemId
            successTitle = response.title ?? urlText
            isLoading = false
            return true
        } catch {
            let duration = Date().timeIntervalSince(loadingStartTime)
            log("❌ Failed to save after \(String(format: "%.2f", duration))s - Error: \(error.localizedDescription)")

            errorMessage = "Failed to save. Please try again."
            Haptics.error()
            isLoading = false
            return false
        }
    }

    /// Compress image if needed
    private func compressImage(_ data: Data, maxSizeBytes: Int) -> Data {
        guard let image = UIImage(data: data) else {
            log("⚠️ Failed to create UIImage from data")
            return data
        }

        let originalSizeMB = Double(data.count) / 1_048_576
        log("📸 Original image size: \(String(format: "%.2f", originalSizeMB))MB")

        var compression: CGFloat = 1.0
        var imageData = data

        while imageData.count > maxSizeBytes && compression > 0.1 {
            compression -= 0.1
            if let compressed = image.jpegData(compressionQuality: compression) {
                imageData = compressed
            }
        }

        let finalSizeMB = Double(imageData.count) / 1_048_576
        let compressionLevel = Int((1.0 - compression) * 100)

        if imageData.count != data.count {
            log("🗜️  Compressed image: \(String(format: "%.2f", originalSizeMB))MB → \(String(format: "%.2f", finalSizeMB))MB (quality: \(String(format: "%.1f", compression * 100))%)")
        } else {
            log("✅ No compression needed")
        }

        return imageData
    }

    /// Save image to Stash (Phase 2 - Image analysis with Gemini Vision)
    func saveImage(imageData: Data) async -> Bool {
        log("📸 Starting image save - Original size: \(imageData.count) bytes")

        isLoading = true
        loadingStartTime = Date()
        errorMessage = nil
        progressMessage = "Analyzing image..."

        // Compress if needed (max 4MB)
        let compressedData = compressImage(imageData, maxSizeBytes: 4 * 1024 * 1024)

        do {
            log("📤 Calling API to create item from image...")
            let response = try await apiClient.createItemFromImage(
                imageData: compressedData
            )
            let duration = Date().timeIntervalSince(loadingStartTime)

            log("✅ Image item created successfully - ID: \(response.itemId), Status: \(response.status), Duration: \(String(format: "%.2f", duration))s")

            createdItemId = response.itemId
            successTitle = response.title ?? "Image"
            isLoading = false
            return true
        } catch {
            let duration = Date().timeIntervalSince(loadingStartTime)
            log("❌ Failed to analyze image after \(String(format: "%.2f", duration))s - Error: \(error.localizedDescription)")

            errorMessage = "Failed to analyze image"
            Haptics.error()
            isLoading = false
            return false
        }
    }
}
