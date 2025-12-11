import SwiftUI

/// Content-native detail view that renders the actual webpage with Stash controls overlay
/// This is the "Detail = Content" principle in action
struct ContentDetailView: View {
    let item: ItemSummary
    
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    
    @State private var isLoading = true
    @State private var loadProgress: Double = 0
    @State private var liked: Bool? = nil
    @State private var showShareSheet = false
    
    private let actionsManager = ItemActionsManager.shared
    
    var body: some View {
        ZStack {
            // The actual content - WebView
            if let urlString = item.canonicalUrl, let url = URL(string: urlString) {
                StashWebView(
                    url: url,
                    isLoading: $isLoading,
                    progress: $loadProgress
                )
                .ignoresSafeArea(edges: .bottom)
            } else {
                // Fallback if no URL
                ContentUnavailableView(
                    "Content Unavailable",
                    systemImage: "link.badge.plus",
                    description: Text("This item doesn't have a valid URL")
                )
            }
            
            // Loading progress bar
            if isLoading {
                VStack {
                    ProgressView(value: loadProgress)
                        .progressViewStyle(.linear)
                        .tint(StashTheme.Color.accent)
                    Spacer()
                }
            }
            
            // Bottom control bar - consistent placement
            VStack {
                Spacer()
                DetailControlBar(
                    item: item,
                    primaryActionLabel: "Open in Safari",
                    primaryActionIcon: "safari",
                    onPrimaryAction: {
                        if let urlString = item.canonicalUrl, let url = URL(string: urlString) {
                            openURL(url)
                        }
                    },
                    onShare: {
                        showShareSheet = true
                    }
                )
            }
        }
        .navigationTitle(item.title)
        .toolbar(.hidden, for: .tabBar)
        .detailToolbar(item: item, liked: $liked) { newValue in
            handleLikeChange(newValue)
        }
        .trackEngagement(itemId: item.itemId)
        .sheet(isPresented: $showShareSheet) {
            if let urlString = item.canonicalUrl, let url = URL(string: urlString) {
                ShareSheet(items: [url])
            }
        }
    }
    
    private func handleLikeChange(_ newValue: Bool?) {
        Task {
            if newValue == true {
                await actionsManager.likeItem(itemId: item.itemId)
            } else if newValue == false {
                await actionsManager.dislikeItem(itemId: item.itemId)
            } else if newValue == nil {
                // User toggled off (was liked or disliked, now neutral)
                await actionsManager.unlikeItem(itemId: item.itemId)
            }
        }
    }
}

// MARK: - Share Sheet

struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

// MARK: - Preview

#Preview {
    NavigationStack {
        ContentDetailView(item: .mockArticle)
    }
}
