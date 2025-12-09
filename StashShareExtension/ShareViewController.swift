//
//  ShareViewController.swift
//  StashShareExtension
//
//  Created by Avital, Nadav on 11/26/25.
//

import UIKit
import UniformTypeIdentifiers

/// Share Extension for saving URLs to Stash
class ShareViewController: UIViewController {

    // MARK: - UI Components

    private let iconImageView = UIImageView()
    private let titleLabel = UILabel()
    private let urlLabel = UILabel()
    private let saveButton = UIButton(type: .system)

    // Progress UI
    private let statusLabel = UILabel()
    private let activityIndicator = UIActivityIndicatorView(style: .large)

    // MARK: - State

    private var extractedURL: String?
    private var urlMetadata: URLMetadata?

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
        extractURL()
    }

    // MARK: - UI Setup

    private func setupUI() {
        view.backgroundColor = UIColor(red: 0.02, green: 0.04, blue: 0.08, alpha: 1.0) // #050A15

        // Icon/Preview Image
        iconImageView.contentMode = .scaleAspectFill
        iconImageView.clipsToBounds = true
        iconImageView.layer.cornerRadius = 12
        iconImageView.translatesAutoresizingMaskIntoConstraints = false
        iconImageView.backgroundColor = UIColor(white: 0.15, alpha: 1.0)
        view.addSubview(iconImageView)

        // Title label
        titleLabel.text = "Loading..."
        titleLabel.textColor = .white
        titleLabel.font = UIFont.systemFont(ofSize: 17, weight: .semibold)
        titleLabel.textAlignment = .center
        titleLabel.numberOfLines = 2
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(titleLabel)

        // URL label
        urlLabel.text = ""
        urlLabel.textColor = UIColor(white: 1.0, alpha: 0.6)
        urlLabel.font = UIFont.systemFont(ofSize: 13)
        urlLabel.textAlignment = .center
        urlLabel.numberOfLines = 1
        urlLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(urlLabel)

        // Save button
        saveButton.setTitle("Save to Stash", for: .normal)
        saveButton.setTitleColor(.white, for: .normal)
        saveButton.backgroundColor = UIColor(named: "AccentColor")
        saveButton.titleLabel?.font = UIFont.systemFont(ofSize: 17, weight: .semibold)
        saveButton.layer.cornerRadius = 12
        saveButton.translatesAutoresizingMaskIntoConstraints = false
        saveButton.addTarget(self, action: #selector(saveToStash), for: .touchUpInside)
        saveButton.isEnabled = false
        saveButton.alpha = 0.5
        view.addSubview(saveButton)

        // Status label (hidden initially)
        statusLabel.text = ""
        statusLabel.textColor = .white
        statusLabel.font = UIFont.systemFont(ofSize: 17, weight: .semibold)
        statusLabel.textAlignment = .center
        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        statusLabel.isHidden = true
        view.addSubview(statusLabel)

        // Activity indicator (hidden initially)
        activityIndicator.color = UIColor(red: 0.14, green: 0.83, blue: 0.77, alpha: 1.0)
        activityIndicator.translatesAutoresizingMaskIntoConstraints = false
        activityIndicator.isHidden = true
        view.addSubview(activityIndicator)

        // Layout
        NSLayoutConstraint.activate([
            iconImageView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 40),
            iconImageView.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            iconImageView.widthAnchor.constraint(equalToConstant: 120),
            iconImageView.heightAnchor.constraint(equalToConstant: 120),

            titleLabel.topAnchor.constraint(equalTo: iconImageView.bottomAnchor, constant: 20),
            titleLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            titleLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),

            urlLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 8),
            urlLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            urlLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),

            saveButton.topAnchor.constraint(equalTo: urlLabel.bottomAnchor, constant: 32),
            saveButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            saveButton.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),
            saveButton.heightAnchor.constraint(equalToConstant: 52),

            statusLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            statusLabel.centerYAnchor.constraint(equalTo: view.centerYAnchor),

            activityIndicator.topAnchor.constraint(equalTo: statusLabel.bottomAnchor, constant: 16),
            activityIndicator.centerXAnchor.constraint(equalTo: view.centerXAnchor)
        ])
    }

    // MARK: - URL Extraction

    private func extractURL() {
        guard let extensionItem = extensionContext?.inputItems.first as? NSExtensionItem,
              let itemProvider = extensionItem.attachments?.first else {
            showError("No URL found")
            return
        }

        if itemProvider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
            itemProvider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { [weak self] (item, error) in
                DispatchQueue.main.async {
                    if let url = item as? URL {
                        self?.extractedURL = url.absoluteString
                        self?.fetchMetadata(for: url)
                    } else {
                        self?.showError("Invalid URL")
                    }
                }
            }
        } else {
            showError("Please share a URL")
        }
    }

    private func fetchMetadata(for url: URL) {
        // Show basic info immediately
        if let host = url.host {
            urlLabel.text = host
        }

        // Try to fetch page title and image
        Task {
            let metadata = await URLMetadataFetcher.fetch(url: url)
            await MainActor.run {
                self.urlMetadata = metadata
                self.updateUI(with: metadata)
            }
        }
    }

    private func updateUI(with metadata: URLMetadata) {
        titleLabel.text = metadata.title ?? "Link"

        if let imageURL = metadata.imageURL {
            loadImage(from: imageURL)
        } else {
            // Show emoji for detected type
            setEmojiForURL(extractedURL ?? "")
        }

        saveButton.isEnabled = true
        saveButton.alpha = 1.0
    }

    private func setEmojiForURL(_ urlString: String) {
        let lowercased = urlString.lowercased()
        var emoji = "📦"

        // Detect platform
        if lowercased.contains("twitter.com") || lowercased.contains("x.com") {
            emoji = "🐦"
        } else if lowercased.contains("instagram.com") {
            emoji = "📸"
        } else if lowercased.contains("tiktok.com") {
            emoji = "🎵"
        } else if lowercased.contains("youtube.com") || lowercased.contains("youtu.be") {
            emoji = "📺"
        } else if lowercased.contains("threads.net") {
            emoji = "🧵"
        } else if lowercased.contains("music.apple.com") || lowercased.contains("spotify.com") {
            emoji = "🎵"
        }

        iconImageView.isHidden = true
        let emojiLabel = UILabel()
        emojiLabel.text = emoji
        emojiLabel.font = UIFont.systemFont(ofSize: 60)
        emojiLabel.textAlignment = .center
        emojiLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(emojiLabel)

        NSLayoutConstraint.activate([
            emojiLabel.centerXAnchor.constraint(equalTo: iconImageView.centerXAnchor),
            emojiLabel.centerYAnchor.constraint(equalTo: iconImageView.centerYAnchor)
        ])
    }

    private func loadImage(from urlString: String) {
        guard let url = URL(string: urlString) else { return }

        Task {
            do {
                let (data, _) = try await URLSession.shared.data(from: url)
                if let image = UIImage(data: data) {
                    await MainActor.run {
                        iconImageView.image = image
                        iconImageView.isHidden = false
                    }
                }
            } catch {
                print("Failed to load image: \(error)")
            }
        }
    }

    // MARK: - Actions

    @objc private func saveToStash() {
        guard let urlString = extractedURL else {
            showError("No URL to save")
            return
        }

        // Verify auth
        guard SharedAuthManager.getAccessToken() != nil,
              SharedAuthManager.getUserId() != nil else {
            showError("Please open Stash app to sign in")
            return
        }

        // Hide UI and show progress
        iconImageView.isHidden = true
        titleLabel.isHidden = true
        urlLabel.isHidden = true
        saveButton.isHidden = true

        statusLabel.text = "Saving to Stash..."
        statusLabel.isHidden = false
        activityIndicator.isHidden = false
        activityIndicator.startAnimating()

        // Save URL
        SharedAuthManager.savePendingURL(urlString, source: "self")

        // Show success
        showSuccess()
    }

    // MARK: - UI States

    private func showSuccess() {
        activityIndicator.stopAnimating()
        activityIndicator.isHidden = true
        statusLabel.text = "Saved to your Stash!"

        // Auto-dismiss after 1 second
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
            self?.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
        }
    }

    private func showError(_ message: String) {
        titleLabel.text = message
        titleLabel.textColor = UIColor(red: 0.95, green: 0.45, blue: 0.45, alpha: 1.0)
        urlLabel.isHidden = true
        saveButton.isHidden = true
    }
}

// MARK: - URL Metadata Fetching

struct URLMetadata {
    let title: String?
    let imageURL: String?
}

actor URLMetadataFetcher {
    static func fetch(url: URL) async -> URLMetadata {
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            guard let html = String(data: data, encoding: .utf8) else {
                return URLMetadata(title: nil, imageURL: nil)
            }

            let title = extractTitle(from: html)
            let imageURL = extractImageURL(from: html)

            return URLMetadata(title: title, imageURL: imageURL)
        } catch {
            print("Failed to fetch metadata: \(error)")
            return URLMetadata(title: nil, imageURL: nil)
        }
    }

    private static func extractTitle(from html: String) -> String? {
        // Try og:title first
        if let range = html.range(of: #"<meta property="og:title" content="([^"]+)""#, options: .regularExpression) {
            let match = String(html[range])
            if let contentRange = match.range(of: #"content="([^"]+)""#, options: .regularExpression) {
                let content = String(match[contentRange])
                return content.replacingOccurrences(of: #"content=""#, with: "").replacingOccurrences(of: "\"", with: "")
            }
        }

        // Fallback to <title>
        if let range = html.range(of: #"<title>([^<]+)</title>"#, options: .regularExpression) {
            let match = String(html[range])
            return match.replacingOccurrences(of: "<title>", with: "").replacingOccurrences(of: "</title>", with: "")
        }

        return nil
    }

    private static func extractImageURL(from html: String) -> String? {
        // Try og:image
        if let range = html.range(of: #"<meta property="og:image" content="([^"]+)""#, options: .regularExpression) {
            let match = String(html[range])
            if let contentRange = match.range(of: #"content="([^"]+)""#, options: .regularExpression) {
                let content = String(match[contentRange])
                return content.replacingOccurrences(of: #"content=""#, with: "").replacingOccurrences(of: "\"", with: "")
            }
        }

        // Try twitter:image
        if let range = html.range(of: #"<meta name="twitter:image" content="([^"]+)""#, options: .regularExpression) {
            let match = String(html[range])
            if let contentRange = match.range(of: #"content="([^"]+)""#, options: .regularExpression) {
                let content = String(match[contentRange])
                return content.replacingOccurrences(of: #"content=""#, with: "").replacingOccurrences(of: "\"", with: "")
            }
        }

        return nil
    }
}

// MARK: - SharedAuthManager

fileprivate struct SharedAuthManager {
    static let suiteName = "group.Nadav.Stash"

    static func getAccessToken() -> String? {
        guard let defaults = UserDefaults(suiteName: suiteName) else {
            return nil
        }
        return defaults.string(forKey: "access_token")
    }

    static func getUserId() -> String? {
        guard let defaults = UserDefaults(suiteName: suiteName) else {
            return nil
        }
        return defaults.string(forKey: "user_id")
    }

    static func savePendingURL(_ url: String, source: String) {
        guard let defaults = UserDefaults(suiteName: suiteName) else {
            return
        }

        var pending = getPendingURLs()
        let item: [String: String] = ["url": url, "source": source]
        pending.append(item)

        defaults.set(pending, forKey: "pending_urls")
        defaults.synchronize()
    }

    static func getPendingURLs() -> [[String: String]] {
        guard let defaults = UserDefaults(suiteName: suiteName) else {
            return []
        }
        return defaults.array(forKey: "pending_urls") as? [[String: String]] ?? []
    }
}
