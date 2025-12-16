import SwiftUI

/// Profile sheet accessed from Home toolbar
/// Replaces "You" tab with sheet presentation
struct ProfileSheetView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var authManager = AuthManager.shared
    @StateObject private var viewModel = YouViewModel()

    @State private var showingYourCode = false
    @State private var showingStashList = false
    @State private var showingFriendsList = false
    @State private var showingSettings = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // User header
                    userHeader

                    // Quick actions grid
                    quickActionsGrid

                    // Stats row
                    statsRow
                }
                .padding()
            }
            .background(StashTheme.Color.bg.ignoresSafeArea())
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 20))
                            .foregroundStyle(.secondary)
                            .symbolRenderingMode(.hierarchical)
                    }
                }

                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showingSettings = true
                    } label: {
                        Image(systemName: "gearshape")
                            .font(.system(size: 16, weight: .medium))
                    }
                }
            }
            .sheet(isPresented: $showingYourCode) {
                YourCodeView()
            }
            .sheet(isPresented: $showingStashList) {
                StashListView(items: viewModel.items)
            }
            .sheet(isPresented: $showingFriendsList) {
                FriendsListView(friends: viewModel.friends)
            }
            .sheet(isPresented: $showingSettings) {
                SettingsView()
            }
        }
        .task {
            await viewModel.load()
        }
    }

    // MARK: - User Header

    private var userHeader: some View {
        VStack(spacing: 16) {
            // Avatar
            Circle()
                .fill(
                    LinearGradient(
                        colors: [StashTheme.Color.accent, StashTheme.Color.accent.opacity(0.6)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 80, height: 80)
                .overlay(
                    Text(authManager.userHandle?.prefix(1).uppercased() ?? "?")
                        .font(.system(size: 36, weight: .bold))
                        .foregroundStyle(.white)
                )

            // Handle
            if let handle = authManager.userHandle {
                Text("@\(handle)")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(StashTheme.Color.textPrimary)
            }
        }
        .padding(.top, 8)
    }

    // MARK: - Quick Actions Grid

    private var quickActionsGrid: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            // Your Code
            QuickActionCard(
                icon: "qrcode",
                title: "Your Code",
                subtitle: "Add friends instantly",
                color: StashTheme.Color.accent
            ) {
                showingYourCode = true
            }

            // Scan Code
            QuickActionCard(
                icon: "camera",
                title: "Scan Code",
                subtitle: "Add a friend",
                color: .blue
            ) {
                showingYourCode = true // Will open to scan tab
            }

            // Your Stash
            QuickActionCard(
                icon: "tray.full",
                title: "Your Stash",
                subtitle: "\(viewModel.items.count) items",
                color: .orange
            ) {
                showingStashList = true
            }

            // Friends
            QuickActionCard(
                icon: "person.2",
                title: "Friends",
                subtitle: "\(viewModel.friends.count) friends",
                color: .green
            ) {
                showingFriendsList = true
            }
        }
    }

    // MARK: - Stats Row

    private var statsRow: some View {
        HStack(spacing: 0) {
            StatItem(value: "\(viewModel.items.count)", label: "Saved")

            Divider()
                .frame(height: 40)

            StatItem(value: "\(viewModel.friends.count)", label: "Friends")

            Divider()
                .frame(height: 40)

            StatItem(value: "0", label: "Shared")
        }
        .padding()
        .background(StashTheme.Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: StashTheme.Radius.card))
    }
}

// MARK: - Quick Action Card

struct QuickActionCard: View {
    let icon: String
    let title: String
    let subtitle: String
    let color: Color
    let action: () -> Void

    var body: some View {
        Button {
            Haptics.light()
            action()
        } label: {
            VStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 28, weight: .medium))
                    .foregroundStyle(color)
                    .frame(height: 40)

                VStack(spacing: 4) {
                    Text(title)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(StashTheme.Color.textPrimary)

                    Text(subtitle)
                        .font(.system(size: 13))
                        .foregroundStyle(StashTheme.Color.textMuted)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 20)
            .background(StashTheme.Color.surface)
            .clipShape(RoundedRectangle(cornerRadius: StashTheme.Radius.card))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Stat Item

struct StatItem: View {
    let value: String
    let label: String

    var body: some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.system(size: 24, weight: .bold))
                .foregroundStyle(StashTheme.Color.textPrimary)

            Text(label)
                .font(.system(size: 13))
                .foregroundStyle(StashTheme.Color.textMuted)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Preview

#Preview {
    ProfileSheetView()
}
