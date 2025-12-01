import Foundation
import Combine

/// ViewModel for handle setup flow
@MainActor
class HandleSetupViewModel: ObservableObject {
    @Published var isChecking = false
    @Published var isLoading = false
    @Published var isAvailable: Bool?
    @Published var errorMessage: String?

    private let authManager = AuthManager.shared
    private var checkTask: Task<Void, Never>?

    /// Check if handle is available
    func checkAvailability(handle: String) async {
        // Cancel previous check
        checkTask?.cancel()

        guard handle.count >= 3 else {
            isAvailable = nil
            return
        }

        checkTask = Task {
            isChecking = true
            isAvailable = nil

            // Debounce: wait a bit before checking
            try? await Task.sleep(nanoseconds: 300_000_000) // 0.3 seconds

            guard !Task.isCancelled else { return }

            do {
                let available = try await authManager.checkHandleAvailability(handle: handle)
                if !Task.isCancelled {
                    isAvailable = available
                    errorMessage = nil // Clear any previous errors
                }
            } catch {
                if !Task.isCancelled {
                    print("Handle availability check failed: \(error)")
                    // Assume available on error to not block user
                    isAvailable = true
                    errorMessage = nil
                }
            }

            isChecking = false
        }
    }

    /// Set the user's handle
    func setHandle(handle: String) async {
        isLoading = true
        errorMessage = nil

        do {
            try await authManager.setUserHandle(handle: handle)
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }
}
