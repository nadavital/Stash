import SwiftUI

/// Add friend sheet with multiple methods
/// Search by handle, scan code, or invite via link
struct AddFriendSheet: View {
    @Environment(\.dismiss) private var dismiss

    enum Tab: String, CaseIterable, Identifiable {
        case search = "Search"
        case scan = "Scan Code"
        case invite = "Invite"

        var id: String { rawValue }

        var icon: String {
            switch self {
            case .search: return "magnifyingglass"
            case .scan: return "qrcode.viewfinder"
            case .invite: return "square.and.arrow.up"
            }
        }
    }

    @State private var selectedTab: Tab = .search

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Tab picker
                tabPicker

                Divider()

                // Tab content
                TabView(selection: $selectedTab) {
                    searchTab
                        .tag(Tab.search)

                    scanTab
                        .tag(Tab.scan)

                    inviteTab
                        .tag(Tab.invite)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
            }
            .background(StashTheme.Color.bg)
            .navigationTitle("Add Friends")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }

    // MARK: - Tab Picker

    private var tabPicker: some View {
        HStack(spacing: 0) {
            ForEach(Tab.allCases) { tab in
                Button {
                    Haptics.light()
                    withAnimation(.spring(response: 0.3)) {
                        selectedTab = tab
                    }
                } label: {
                    VStack(spacing: 6) {
                        Image(systemName: tab.icon)
                            .font(.system(size: 18, weight: .medium))

                        Text(tab.rawValue)
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundStyle(selectedTab == tab ? StashTheme.Color.accent : StashTheme.Color.textMuted)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(
                        selectedTab == tab
                            ? StashTheme.Color.accent.opacity(0.1)
                            : Color.clear
                    )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
    }

    // MARK: - Search Tab

    @State private var searchQuery = ""
    @State private var searchResults: [Friend] = []
    @State private var isSearching = false

    private var searchTab: some View {
        VStack(spacing: 0) {
            // Search bar
            HStack(spacing: 12) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(StashTheme.Color.textMuted)

                TextField("Search by handle or name", text: $searchQuery)
                    .font(.system(size: 16))
                    .submitLabel(.search)
                    .onSubmit {
                        performSearch()
                    }

                if !searchQuery.isEmpty {
                    Button {
                        searchQuery = ""
                        searchResults = []
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(StashTheme.Color.textMuted)
                    }
                }
            }
            .padding(12)
            .background(StashTheme.Color.surface)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .padding()

            // Results
            if isSearching {
                ProgressView()
                    .padding()
            } else if searchResults.isEmpty && !searchQuery.isEmpty {
                emptySearchState
            } else if !searchResults.isEmpty {
                searchResultsList
            } else {
                searchPromptState
            }
        }
    }

    private var searchResultsList: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(searchResults) { friend in
                    friendResultRow(friend)

                    if friend.id != searchResults.last?.id {
                        Divider()
                            .padding(.leading, 72)
                    }
                }
            }
        }
    }

    private func friendResultRow(_ friend: Friend) -> some View {
        HStack(spacing: 14) {
            // Avatar
            Circle()
                .fill(
                    LinearGradient(
                        colors: [.blue, .blue.opacity(0.6)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 44, height: 44)
                .overlay(
                    Text((friend.name ?? friend.handle).prefix(1).uppercased())
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(.white)
                )

            VStack(alignment: .leading, spacing: 3) {
                Text(friend.name ?? friend.handle)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(StashTheme.Color.textPrimary)

                Text("@\(friend.handle)")
                    .font(.system(size: 14))
                    .foregroundStyle(StashTheme.Color.textMuted)
            }

            Spacer()

            // Add button
            Button {
                addFriend(friend)
            } label: {
                Text("Add")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 8)
                    .background(StashTheme.Color.accent)
                    .clipShape(Capsule())
            }
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 16)
    }

    private var searchPromptState: some View {
        VStack(spacing: 16) {
            Image(systemName: "person.fill.questionmark")
                .font(.system(size: 50))
                .foregroundStyle(StashTheme.Color.textMuted)

            Text("Search for friends")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(StashTheme.Color.textPrimary)

            Text("Find people by their handle or name")
                .font(.system(size: 14))
                .foregroundStyle(StashTheme.Color.textMuted)
                .multilineTextAlignment(.center)
        }
        .frame(maxHeight: .infinity)
        .padding()
    }

    private var emptySearchState: some View {
        VStack(spacing: 16) {
            Image(systemName: "person.crop.circle.badge.xmark")
                .font(.system(size: 50))
                .foregroundStyle(StashTheme.Color.textMuted)

            Text("No results found")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(StashTheme.Color.textPrimary)

            Text("Try a different search")
                .font(.system(size: 14))
                .foregroundStyle(StashTheme.Color.textMuted)
        }
        .frame(maxHeight: .infinity)
        .padding()
    }

    // MARK: - Scan Tab

    @State private var showingScanner = false

    private var scanTab: some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: "qrcode.viewfinder")
                .font(.system(size: 80))
                .foregroundStyle(StashTheme.Color.accent)

            VStack(spacing: 8) {
                Text("Scan Friend's Code")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundStyle(StashTheme.Color.textPrimary)

                Text("Instantly add friends by scanning their QR code")
                    .font(.system(size: 15))
                    .foregroundStyle(StashTheme.Color.textMuted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }

            Button {
                showingScanner = true
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "camera")
                    Text("Open Camera")
                        .font(.system(size: 16, weight: .semibold))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 32)
                .padding(.vertical, 14)
                .background(StashTheme.Color.accent)
                .clipShape(Capsule())
            }
            .padding(.top, 8)

            Spacer()
        }
        .padding()
        .fullScreenCover(isPresented: $showingScanner) {
            ScanFriendCodeView()
        }
    }

    // MARK: - Invite Tab

    private var inviteTab: some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: "square.and.arrow.up")
                .font(.system(size: 80))
                .foregroundStyle(StashTheme.Color.accent)

            VStack(spacing: 8) {
                Text("Invite Friends")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundStyle(StashTheme.Color.textPrimary)

                Text("Share your invite link with friends to join Stash")
                    .font(.system(size: 15))
                    .foregroundStyle(StashTheme.Color.textMuted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }

            VStack(spacing: 12) {
                Button {
                    shareInviteLink()
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "square.and.arrow.up")
                        Text("Share Invite Link")
                            .font(.system(size: 16, weight: .semibold))
                    }
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(StashTheme.Color.accent)
                    .clipShape(Capsule())
                }

                Button {
                    copyInviteLink()
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "doc.on.doc")
                        Text("Copy Link")
                            .font(.system(size: 16, weight: .medium))
                    }
                    .foregroundStyle(StashTheme.Color.accent)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(StashTheme.Color.surface)
                    .clipShape(Capsule())
                }
            }
            .padding(.horizontal, 32)
            .padding(.top, 8)

            Spacer()
        }
        .padding()
    }

    // MARK: - Actions

    private func performSearch() {
        guard !searchQuery.isEmpty else { return }

        isSearching = true
        // TODO: Call backend to search for users
        Task {
            try? await Task.sleep(for: .seconds(1))
            searchResults = []
            isSearching = false
        }
    }

    private func addFriend(_ friend: Friend) {
        Haptics.success()
        // TODO: Call backend to add friend
        dismiss()
    }

    private func shareInviteLink() {
        Haptics.light()
        // TODO: Generate invite link and open share sheet
    }

    private func copyInviteLink() {
        Haptics.success()
        // TODO: Copy invite link to clipboard
    }
}

// MARK: - Preview

#Preview {
    AddFriendSheet()
}
