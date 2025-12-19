import SwiftUI
import CryptoKit

/// Shared image cache with both memory and disk persistence
class ImageCache {
    static let shared = ImageCache()

    private let memoryCache = NSCache<NSString, UIImage>()
    private let fileManager = FileManager.default
    private let diskCacheURL: URL
    private let ioQueue = DispatchQueue(label: "com.stash.imagecache.io", qos: .utility)

    // Disk cache settings
    private let maxDiskCacheSize: Int = 100 * 1024 * 1024 // 100MB
    private let maxDiskCacheAge: TimeInterval = 7 * 24 * 60 * 60 // 7 days

    private init() {
        // Configure memory cache limits
        memoryCache.countLimit = 100 // Max 100 images
        memoryCache.totalCostLimit = 50 * 1024 * 1024 // 50MB

        // Set up disk cache directory
        let cacheDirectory = fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first!
        diskCacheURL = cacheDirectory.appendingPathComponent("StashImageCache", isDirectory: true)

        // Create cache directory if needed
        try? fileManager.createDirectory(at: diskCacheURL, withIntermediateDirectories: true)

        // Clean up old cache files on init
        ioQueue.async { [weak self] in
            self?.cleanDiskCacheIfNeeded()
        }
    }

    // MARK: - Public API

    func get(_ url: String) -> UIImage? {
        // Check memory cache first
        if let memoryImage = memoryCache.object(forKey: url as NSString) {
            return memoryImage
        }

        // Check disk cache
        if let diskImage = loadFromDisk(url: url) {
            // Restore to memory cache
            let cost = Int(diskImage.size.width * diskImage.size.height * 4)
            memoryCache.setObject(diskImage, forKey: url as NSString, cost: cost)
            return diskImage
        }

        return nil
    }

    func set(_ image: UIImage, forURL url: String) {
        // Save to memory cache
        let cost = Int(image.size.width * image.size.height * 4)
        memoryCache.setObject(image, forKey: url as NSString, cost: cost)

        // Save to disk cache asynchronously
        ioQueue.async { [weak self] in
            self?.saveToDisk(image: image, url: url)
        }
    }

    /// Pre-load an image into cache
    func preload(_ url: String) async {
        // Already cached
        if get(url) != nil {
            return
        }

        // Download and cache
        guard let imageURL = URL(string: url) else { return }

        do {
            let (data, _) = try await URLSession.shared.data(from: imageURL)
            if let image = UIImage(data: data) {
                set(image, forURL: url)
            }
        } catch {
            // Silent fail for preloading
        }
    }

    // MARK: - Disk Cache Operations

    private func cacheKey(for url: String) -> String {
        // Create a hash of the URL for safe filename
        let data = Data(url.utf8)
        let hash = SHA256.hash(data: data)
        return hash.compactMap { String(format: "%02x", $0) }.joined()
    }

    private func cacheFilePath(for url: String) -> URL {
        return diskCacheURL.appendingPathComponent(cacheKey(for: url))
    }

    private func loadFromDisk(url: String) -> UIImage? {
        let filePath = cacheFilePath(for: url)

        guard fileManager.fileExists(atPath: filePath.path) else {
            return nil
        }

        // Check if file is too old
        if let attributes = try? fileManager.attributesOfItem(atPath: filePath.path),
           let modificationDate = attributes[.modificationDate] as? Date {
            if Date().timeIntervalSince(modificationDate) > maxDiskCacheAge {
                try? fileManager.removeItem(at: filePath)
                return nil
            }
        }

        guard let data = try? Data(contentsOf: filePath),
              let image = UIImage(data: data) else {
            return nil
        }

        return image
    }

    private func saveToDisk(image: UIImage, url: String) {
        let filePath = cacheFilePath(for: url)

        // Use JPEG for photos, PNG for graphics with transparency
        if let data = image.jpegData(compressionQuality: 0.8) {
            try? data.write(to: filePath)
        }
    }

    // MARK: - Cache Cleanup

    private func cleanDiskCacheIfNeeded() {
        guard let files = try? fileManager.contentsOfDirectory(at: diskCacheURL, includingPropertiesForKeys: [.contentModificationDateKey, .fileSizeKey]) else {
            return
        }

        var totalSize: Int = 0
        var cacheFiles: [(url: URL, date: Date, size: Int)] = []

        for file in files {
            guard let attributes = try? file.resourceValues(forKeys: [.contentModificationDateKey, .fileSizeKey]),
                  let modDate = attributes.contentModificationDate,
                  let size = attributes.fileSize else {
                continue
            }

            totalSize += size

            // Remove files older than max age
            if Date().timeIntervalSince(modDate) > maxDiskCacheAge {
                try? fileManager.removeItem(at: file)
            } else {
                cacheFiles.append((file, modDate, size))
            }
        }

        // If still over size limit, remove oldest files first
        if totalSize > maxDiskCacheSize {
            let sortedFiles = cacheFiles.sorted { $0.date < $1.date }
            var currentSize = totalSize

            for file in sortedFiles {
                if currentSize <= maxDiskCacheSize / 2 { // Clean to 50% capacity
                    break
                }
                try? fileManager.removeItem(at: file.url)
                currentSize -= file.size
            }
        }
    }

    /// Clear all cached images (memory and disk)
    func clearCache() {
        memoryCache.removeAllObjects()
        ioQueue.async { [weak self] in
            guard let self = self else { return }
            try? self.fileManager.removeItem(at: self.diskCacheURL)
            try? self.fileManager.createDirectory(at: self.diskCacheURL, withIntermediateDirectories: true)
        }
    }
}

/// Cached async image view that uses shared cache
struct CachedAsyncImage<Content: View, Placeholder: View>: View {
    let url: URL?
    let content: (Image) -> Content
    let placeholder: () -> Placeholder

    @State private var image: UIImage?
    @State private var isLoading = false

    init(
        url: URL?,
        @ViewBuilder content: @escaping (Image) -> Content,
        @ViewBuilder placeholder: @escaping () -> Placeholder
    ) {
        self.url = url
        self.content = content
        self.placeholder = placeholder

        // Check cache synchronously on init to prevent flicker
        if let url = url,
           let cachedImage = ImageCache.shared.get(url.absoluteString) {
            _image = State(initialValue: cachedImage)
        }
    }

    var body: some View {
        Group {
            if let image = image {
                content(Image(uiImage: image))
            } else {
                placeholder()
            }
        }
        .onChange(of: url) { oldValue, newValue in
            // Immediately update to cached image if available when URL changes
            if let newURL = newValue,
               let cachedImage = ImageCache.shared.get(newURL.absoluteString) {
                image = cachedImage
            } else {
                image = nil
            }
        }
        .task(id: url) {
            await loadImage()
        }
    }

    private func loadImage() async {
        guard let url = url else { return }

        // Check cache first (now checks both memory and disk)
        if let cachedImage = ImageCache.shared.get(url.absoluteString) {
            self.image = cachedImage
            return
        }

        // Download if not in cache
        isLoading = true
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            if let downloadedImage = UIImage(data: data) {
                ImageCache.shared.set(downloadedImage, forURL: url.absoluteString)
                self.image = downloadedImage
                self.isLoading = false
            }
        } catch {
            print("🔴 Error loading image: \(error)")
            self.isLoading = false
        }
    }
}
