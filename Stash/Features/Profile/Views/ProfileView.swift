import SwiftUI

/// Profile tab - user info and stats
struct ProfileView: View {
    @StateObject private var viewModel = ProfileViewModel()

    var body: some View {
        NavigationStack {
            ScrollView {
                if viewModel.isLoading && viewModel.profile == nil {
                    LoadingView(message: "Loading profile...")
                        .frame(height: 400)
                } else if let profile = viewModel.profile {
                    VStack(spacing: StashSpacing.sectionVertical) {
                        // Profile header
                        VStack(spacing: 8) {
                            if let name = profile.name {
                                Text(name)
                                    .font(StashTypography.pageTitle)
                                    .foregroundColor(StashTheme.Color.textPrimary)
                            }

                            Text("@\(profile.handle)")
                                .font(StashTypography.sectionTitle)
                                .foregroundColor(StashTheme.Color.textSecondary)
                        }
                        .padding(.top, 20)

                        // Stats
                        VStack(alignment: .leading, spacing: 16) {
                            Text("Your Stash")
                                .font(StashTypography.sectionTitle)
                                .foregroundColor(StashTheme.Color.textPrimary)
                                .padding(.horizontal, StashSpacing.screenHorizontal)

                            // Total items card
                            VStack(spacing: 12) {
                                HStack {
                                    Image(systemName: "tray.fill")
                                        .font(.title)
                                        .foregroundColor(StashTheme.Color.accent)

                                    VStack(alignment: .leading) {
                                        Text("\(profile.stats.totalItems)")
                                            .font(StashTypography.pageTitle)
                                            .foregroundColor(StashTheme.Color.textPrimary)

                                        Text("Total Items")
                                            .font(StashTypography.body)
                                            .foregroundColor(StashTheme.Color.textSecondary)
                                    }

                                    Spacer()
                                }
                                .padding(StashSpacing.cardPadding)
                            }
                            .cardStyle()
                            .padding(.horizontal, StashSpacing.screenHorizontal)

                            // Top tags
                            if !profile.stats.topTags.isEmpty {
                                VStack(alignment: .leading, spacing: 12) {
                                    Text("Top Tags")
                                        .font(StashTypography.cardTitle)
                                        .foregroundColor(StashTheme.Color.textPrimary)
                                        .padding(.horizontal, StashSpacing.screenHorizontal)

                                    ScrollView(.horizontal, showsIndicators: false) {
                                        HStack(spacing: StashSpacing.related) {
                                            ForEach(profile.stats.topTags, id: \.self) { tag in
                                                Text("#\(tag)")
                                                    .font(StashTypography.body)
                                                    .padding(.horizontal, 16)
                                                    .padding(.vertical, 10)
                                                    .background(StashTheme.Color.accentSoft)
                                                    .foregroundColor(StashTheme.Color.accent)
                                                    .cornerRadius(StashTheme.Radius.pill)
                                            }
                                        }
                                        .padding(.horizontal, StashSpacing.screenHorizontal)
                                    }
                                }
                            }

                            // Type mix
                            VStack(alignment: .leading, spacing: 12) {
                                Text("What You Save")
                                    .font(StashTypography.cardTitle)
                                    .foregroundColor(StashTheme.Color.textPrimary)
                                    .padding(.horizontal, StashSpacing.screenHorizontal)

                                VStack(spacing: 8) {
                                    TypeMixRow(type: "Articles", percentage: profile.stats.typeMix.article, color: StashTheme.Color.accent)
                                    TypeMixRow(type: "Songs", percentage: profile.stats.typeMix.song, color: StashTheme.Color.ai)
                                    TypeMixRow(type: "Events", percentage: profile.stats.typeMix.event, color: StashTheme.Color.warning)
                                    TypeMixRow(type: "Recipes", percentage: profile.stats.typeMix.recipe, color: StashTheme.Color.success)
                                    TypeMixRow(type: "Other", percentage: profile.stats.typeMix.generic, color: StashTheme.Color.textMuted)
                                }
                                .padding(StashSpacing.cardPadding)
                                .cardStyle()
                                .padding(.horizontal, StashSpacing.screenHorizontal)
                            }
                        }

                        // Sign out button
                        Button(role: .destructive) {
                            Task {
                                await viewModel.signOut()
                            }
                        } label: {
                            Text("Sign Out")
                                .font(StashTypography.body)
                                .frame(maxWidth: .infinity)
                                .padding()
                                .background(StashTheme.Color.surfaceSoft)
                                .foregroundColor(StashTheme.Color.danger)
                                .cornerRadius(StashTheme.Radius.card)
                        }
                        .padding(.horizontal, StashSpacing.screenHorizontal)
                        .padding(.top, 20)
                    }
                    .padding(.bottom)
                } else {
                    EmptyStateView(
                        title: "Unable to load profile",
                        message: "Please try again later",
                        systemImage: "person.crop.circle.badge.exclamationmark"
                    )
                }
            }
            .background(StashTheme.Color.bg)
            .navigationTitle("Profile")
        }
        .task {
            if viewModel.profile == nil {
                await viewModel.fetchProfile()
            }
        }
    }
}

/// A row showing type mix percentage
struct TypeMixRow: View {
    let type: String
    let percentage: Double
    let color: Color

    var body: some View {
        HStack(spacing: 12) {
            Text(type)
                .font(StashTypography.body)
                .foregroundColor(StashTheme.Color.textPrimary)
                .frame(width: 80, alignment: .leading)

            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    // Background
                    Rectangle()
                        .fill(StashTheme.Color.surfaceSoft)
                        .cornerRadius(4)

                    // Filled portion
                    Rectangle()
                        .fill(color)
                        .frame(width: geometry.size.width * percentage)
                        .cornerRadius(4)
                }
            }
            .frame(height: 8)

            Text("\(Int(percentage * 100))%")
                .font(StashTypography.caption)
                .foregroundColor(StashTheme.Color.textMuted)
                .frame(width: 40, alignment: .trailing)
        }
    }
}

#Preview {
    ProfileView()
}
