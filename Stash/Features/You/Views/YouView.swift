import SwiftUI

/// The You tab - Your library of saved items and friends
/// This replaces the old Profile tab
struct YouView: View {
    @StateObject private var viewModel = YouViewModel()
    @State private var showingSettings = false
    
    var body: some View {
        NavigationStack {
            ZStack {
                StashTheme.Color.bg
                    .ignoresSafeArea()
                
                if viewModel.isLoading && viewModel.items.isEmpty {
                    ProgressView()
                        .progressViewStyle(.circular)
                        .tint(StashTheme.Color.accent)
                } else {
                    ScrollView {
                        VStack(spacing: Spacing.xl) {
                            // Your Items Section
                            YourItemsSection(items: viewModel.items)
                            
                            // Friends Section
                            YourFriendsSection(friends: viewModel.friends)
                        }
                        .padding(.vertical)
                    }
                }
            }
            .navigationTitle("You")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showingSettings = true
                    } label: {
                        Image(systemName: "gearshape")
                            .foregroundStyle(StashTheme.Color.textSecondary)
                    }
                }
            }
            .sheet(isPresented: $showingSettings) {
                SettingsView()
            }
        }
        .task {
            await viewModel.load()
        }
        .refreshable {
            await viewModel.load()
        }
    }
}

// MARK: - Your Items Section

struct YourItemsSection: View {
    let items: [ItemSummary]
    
    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            HStack {
                HStack(spacing: Spacing.sm) {
                    Image(systemName: "tray.full")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(StashTheme.Color.textSecondary)
                    
                    Text("Your Stash")
                        .font(Typography.headline)
                        .foregroundStyle(StashTheme.Color.textPrimary)
                }
                
                Spacer()
                
                Text("\(items.count) items")
                    .font(Typography.caption)
                    .foregroundStyle(StashTheme.Color.textMuted)
            }
            .padding(.horizontal)
            
            if items.isEmpty {
                EmptyStashView()
            } else {
                LazyVStack(spacing: Spacing.sm) {
                    ForEach(items) { item in
                        NavigationLink {
                            ItemDetailRouter(
                                item: item,
                                relatedItems: items.filter { $0.id != item.id }
                            )
                        } label: {
                            StashItemRow(item: item)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal)
            }
        }
    }
}

struct EmptyStashView: View {
    var body: some View {
        VStack(spacing: Spacing.md) {
            Image(systemName: "tray")
                .font(.system(size: 40))
                .foregroundStyle(StashTheme.Color.textMuted)
            
            Text("Your stash is empty")
                .font(Typography.body)
                .foregroundStyle(StashTheme.Color.textSecondary)
            
            Text("Share links to Stash to save them here")
                .font(Typography.caption)
                .foregroundStyle(StashTheme.Color.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Spacing.xxl)
    }
}

struct StashItemRow: View {
    let item: ItemSummary
    
    var body: some View {
        HStack(spacing: Spacing.md) {
            Text(item.primaryEmoji)
                .font(.system(size: 24))
                .frame(width: 44, height: 44)
                .background(StashTheme.Color.surfaceSoft)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title)
                    .font(Typography.body.weight(.medium))
                    .foregroundStyle(StashTheme.Color.textPrimary)
                    .lineLimit(1)
                
                HStack(spacing: Spacing.xs) {
                    Text(item.type.displayName)
                        .font(Typography.caption)
                        .foregroundStyle(StashTheme.Color.textMuted)
                    
                    if let source = item.metadata.sourceName {
                        Text("•")
                            .foregroundStyle(StashTheme.Color.textMuted)
                        Text(source)
                            .font(Typography.caption)
                            .foregroundStyle(StashTheme.Color.textMuted)
                    }
                }
            }
            
            Spacer()
            
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(StashTheme.Color.textMuted)
        }
        .padding()
        .background(StashTheme.Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: StashTheme.Radius.tile))
    }
}

// MARK: - Your Friends Section

struct YourFriendsSection: View {
    let friends: [Friend]
    
    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            HStack {
                HStack(spacing: Spacing.sm) {
                    Image(systemName: "person.2")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(StashTheme.Color.textSecondary)
                    
                    Text("Friends")
                        .font(Typography.headline)
                        .foregroundStyle(StashTheme.Color.textPrimary)
                }
                
                Spacer()
                
                NavigationLink {
                    FriendsView()
                } label: {
                    Text("Manage")
                        .font(Typography.caption)
                        .foregroundStyle(StashTheme.Color.accent)
                }
            }
            .padding(.horizontal)
            
            if friends.isEmpty {
                EmptyFriendsStateView()
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: Spacing.md) {
                        // Add friend button
                        NavigationLink {
                            AddFriendView()
                        } label: {
                            VStack(spacing: Spacing.sm) {
                                Circle()
                                    .strokeBorder(StashTheme.Color.borderSubtle, style: StrokeStyle(lineWidth: 2, dash: [5]))
                                    .frame(width: 56, height: 56)
                                    .overlay(
                                        Image(systemName: "plus")
                                            .font(.system(size: 20, weight: .medium))
                                            .foregroundStyle(StashTheme.Color.textMuted)
                                    )
                                
                                Text("Add")
                                    .font(Typography.caption)
                                    .foregroundStyle(StashTheme.Color.textMuted)
                            }
                        }
                        .buttonStyle(.plain)
                        
                        ForEach(friends) { friend in
                            FriendBubble(friend: friend)
                        }
                    }
                    .padding(.horizontal)
                }
            }
        }
    }
}

struct EmptyFriendsStateView: View {
    var body: some View {
        VStack(spacing: Spacing.md) {
            NavigationLink {
                AddFriendView()
            } label: {
                HStack(spacing: Spacing.md) {
                    Image(systemName: "person.badge.plus")
                        .font(.system(size: 24))
                        .foregroundStyle(StashTheme.Color.accent)
                    
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Add Friends")
                            .font(Typography.body.weight(.medium))
                            .foregroundStyle(StashTheme.Color.textPrimary)
                        
                        Text("Share and discover together")
                            .font(Typography.caption)
                            .foregroundStyle(StashTheme.Color.textMuted)
                    }
                    
                    Spacer()
                    
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12))
                        .foregroundStyle(StashTheme.Color.textMuted)
                }
                .padding()
                .background(StashTheme.Color.surface)
                .clipShape(RoundedRectangle(cornerRadius: StashTheme.Radius.tile))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal)
    }
}

struct FriendBubble: View {
    let friend: Friend
    
    var body: some View {
        NavigationLink {
            // Friend profile view
            Text("Profile for \(friend.name ?? friend.handle)")
        } label: {
            VStack(spacing: Spacing.sm) {
                Circle()
                    .fill(StashTheme.Color.surfaceSoft)
                    .frame(width: 56, height: 56)
                    .overlay(
                        Text((friend.name ?? friend.handle).prefix(1).uppercased())
                            .font(.system(size: 22, weight: .semibold))
                            .foregroundStyle(StashTheme.Color.textSecondary)
                    )
                
                Text(friend.name ?? friend.handle)
                    .font(Typography.caption)
                    .foregroundStyle(StashTheme.Color.textPrimary)
                    .lineLimit(1)
                
                if let similarity = friend.tasteSimilarity?.similarityScore {
                    Text("\(Int(similarity * 100))%")
                        .font(Typography.caption2)
                        .foregroundStyle(StashTheme.Color.accent)
                }
            }
            .frame(width: 70)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Settings View (replaces Profile)

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var authManager = AuthManager.shared
    
    var body: some View {
        NavigationStack {
            List {
                Section {
                    // User info from AuthManager
                    HStack(spacing: Spacing.md) {
                        Circle()
                            .fill(StashTheme.Color.surfaceSoft)
                            .frame(width: 50, height: 50)
                            .overlay(
                                Text(authManager.userHandle?.prefix(1).uppercased() ?? "?")
                                    .font(.system(size: 20, weight: .semibold))
                                    .foregroundStyle(StashTheme.Color.textSecondary)
                            )
                        
                        VStack(alignment: .leading, spacing: 2) {
                            if let handle = authManager.userHandle {
                                Text("@\(handle)")
                                    .font(Typography.body.weight(.medium))
                            } else {
                                Text("Signed In")
                                    .font(Typography.body.weight(.medium))
                            }
                            
                            Text("Stash Member")
                                .font(Typography.caption)
                                .foregroundStyle(StashTheme.Color.textMuted)
                        }
                    }
                    .padding(.vertical, Spacing.xs)
                }
                
                Section("Account") {
                    Button(role: .destructive) {
                        Task {
                            try? await authManager.signOut()
                        }
                    } label: {
                        Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                }
                
                Section("About") {
                    HStack {
                        Text("Version")
                        Spacer()
                        Text("1.0")
                            .foregroundStyle(StashTheme.Color.textMuted)
                    }
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }
}

// MARK: - Preview

#Preview {
    YouView()
}
