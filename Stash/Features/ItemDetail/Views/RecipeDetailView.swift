import SwiftUI
import EventKit

/// Native recipe detail view following Preview → Engage → Act pattern
/// - Preview: AI summary, ingredients list, cook time (native)
/// - Engage: "View Full Recipe" opens WebView
/// - Act: "Add to Grocery List" integrates with Reminders
struct RecipeDetailView: View {
    let item: ItemSummary
    
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    
    @State private var showFullRecipe = false
    @State private var showAddToListAlert = false
    @State private var addedToList = false
    @State private var liked: Bool? = nil
    @State private var showShareSheet = false
    
    private let actionsManager = ItemActionsManager.shared
    
    // Mock extracted data - would come from enriched metadata
    private var ingredients: [String] {
        item.metadata.ingredients ?? [
            "2 cups all-purpose flour",
            "1 tsp baking powder",
            "1/2 tsp salt",
            "1 cup butter, softened",
            "1 cup sugar",
            "2 large eggs",
            "1 tsp vanilla extract"
        ]
    }
    
    private var prepTime: String {
        item.metadata.prepTime ?? "15 min"
    }
    
    private var cookTime: String {
        item.metadata.cookTime ?? "25 min"
    }
    
    private var servings: Int {
        item.metadata.servings ?? 4
    }
    
    var body: some View {
        ZStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    // Hero image
                    heroSection
                    
                    // Content
                    VStack(alignment: .leading, spacing: Spacing.xl) {
                        // Quick stats
                        quickStatsRow
                        
                        // AI Summary
                        aiSummarySection
                        
                        // Ingredients preview
                        ingredientsSection
                        
                        // Add to grocery list button
                        addToListButton
                        
                        Spacer().frame(height: 120)
                    }
                    .padding(.horizontal, Spacing.lg)
                    .padding(.top, Spacing.xl)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(maxWidth: .infinity)
            }
            .scrollContentBackground(.hidden)
            
            // Bottom control bar - consistent placement
            VStack {
                Spacer()
                DetailControlBar(
                    item: item,
                    primaryActionLabel: "View Recipe",
                    primaryActionIcon: "book.pages",
                    onPrimaryAction: {
                        showFullRecipe = true
                    },
                    onShare: {
                        showShareSheet = true
                    }
                )
            }
        }
        .background(StashTheme.Color.bg)
        .ignoresSafeArea(edges: .top)
        .toolbar(.hidden, for: .tabBar)
        .detailToolbar(item: item, liked: $liked) { newValue in
            handleLikeChange(newValue)
        }
        .trackEngagement(itemId: item.itemId)
        .sheet(isPresented: $showFullRecipe) {
            NavigationStack {
                ContentDetailView(item: item)
            }
        }
        .sheet(isPresented: $showShareSheet) {
            if let urlString = item.canonicalUrl, let url = URL(string: urlString) {
                ShareSheet(items: [url])
            }
        }
        .alert("Add to Grocery List", isPresented: $showAddToListAlert) {
            Button("Add to Reminders") {
                addIngredientsToReminders()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Add \(ingredients.count) ingredients to your Reminders app?")
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
    
    // MARK: - Hero Section
    
    private var heroSection: some View {
        ZStack(alignment: .bottomLeading) {
            // Background image or gradient
            GeometryReader { geo in
                if let iconUrl = item.metadata.iconUrl, let url = URL(string: iconUrl) {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image
                                .resizable()
                                .aspectRatio(contentMode: .fill)
                                .frame(width: geo.size.width, height: 280)
                                .clipped()
                        default:
                            recipeGradient
                        }
                    }
                } else {
                    recipeGradient
                }
            }
            .frame(height: 280)
            
            // Gradient overlay
            LinearGradient(
                colors: [.clear, .clear, StashTheme.Color.bg.opacity(0.7), StashTheme.Color.bg],
                startPoint: .top,
                endPoint: .bottom
            )
            
            // Title
            VStack(alignment: .leading, spacing: Spacing.sm) {
                // Type pill
                HStack(spacing: 6) {
                    Text(item.primaryEmoji)
                        .font(.system(size: 14))
                    Text("Recipe")
                        .font(.system(size: 12, weight: .semibold))
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(.ultraThinMaterial)
                .clipShape(Capsule())
                
                Text(item.title)
                    .font(.system(size: 26, weight: .bold))
                    .foregroundStyle(StashTheme.Color.textPrimary)
                    .lineLimit(3)
                
                if let source = item.metadata.sourceName {
                    Text(source)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(StashTheme.Color.textMuted)
                }
            }
            .padding(.horizontal, Spacing.lg)
            .padding(.bottom, Spacing.lg)
        }
    }
    
    private var recipeGradient: some View {
        ZStack {
            LinearGradient(
                colors: [Color(red: 0.45, green: 0.28, blue: 0.18), Color(red: 0.22, green: 0.12, blue: 0.08)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            
            Text(item.primaryEmoji)
                .font(.system(size: 100))
                .opacity(0.2)
        }
    }
    
    // MARK: - Quick Stats
    
    private var quickStatsRow: some View {
        HStack(spacing: Spacing.lg) {
            StatPill(icon: "clock", label: "Prep", value: prepTime)
            StatPill(icon: "flame", label: "Cook", value: cookTime)
            StatPill(icon: "person.2", label: "Serves", value: "\(servings)")
            Spacer()
        }
    }
    
    // MARK: - AI Summary
    
    private var aiSummarySection: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            HStack(spacing: 8) {
                SynapseLensIcon(size: 20)
                Text("Stash Summary")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(StashTheme.Color.textMuted)
                    .textCase(.uppercase)
                    .tracking(0.5)
            }
            
            Text(item.summary)
                .font(.system(size: 16))
                .foregroundStyle(StashTheme.Color.textPrimary)
                .lineSpacing(5)
        }
        .padding(Spacing.lg)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
    
    // MARK: - Ingredients
    
    private var ingredientsSection: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            HStack {
                Text("Ingredients")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(StashTheme.Color.textMuted)
                    .textCase(.uppercase)
                    .tracking(0.5)
                
                Spacer()
                
                Text("\(ingredients.count) items")
                    .font(.system(size: 13))
                    .foregroundStyle(StashTheme.Color.textMuted)
            }
            
            VStack(alignment: .leading, spacing: Spacing.sm) {
                ForEach(ingredients.prefix(6), id: \.self) { ingredient in
                    HStack(spacing: Spacing.md) {
                        Circle()
                            .fill(StashTheme.Color.accent.opacity(0.3))
                            .frame(width: 6, height: 6)
                        
                        Text(ingredient)
                            .font(.system(size: 15))
                            .foregroundStyle(StashTheme.Color.textPrimary)
                    }
                }
                
                if ingredients.count > 6 {
                    Text("+ \(ingredients.count - 6) more ingredients")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(StashTheme.Color.accent)
                        .padding(.top, Spacing.xs)
                }
            }
            .padding(Spacing.lg)
            .background(.ultraThinMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 16))
        }
    }
    
    // MARK: - Add to List Button
    
    private var addToListButton: some View {
        Button {
            Haptics.light()
            showAddToListAlert = true
        } label: {
            HStack(spacing: 8) {
                Image(systemName: addedToList ? "checkmark.circle.fill" : "cart.badge.plus")
                    .font(.system(size: 14, weight: .semibold))
                Text(addedToList ? "Added to List" : "Add to Grocery List")
                    .font(.system(size: 14, weight: .semibold))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
        }
        .glassEffect(addedToList ? .regular.tint(.green) : .regular, in: .rect(cornerRadius: 12))
        .buttonStyle(.plain)
    }
    
    // MARK: - Reminders Integration
    
    private func addIngredientsToReminders() {
        let eventStore = EKEventStore()
        
        eventStore.requestFullAccessToReminders { granted, error in
            guard granted, error == nil else {
                print("Reminders access denied")
                return
            }
            
            // Find or create a "Grocery List" list
            let calendars = eventStore.calendars(for: .reminder)
            let groceryList = calendars.first { $0.title == "Grocery List" } ?? eventStore.defaultCalendarForNewReminders()
            
            guard let list = groceryList else { return }
            
            for ingredient in ingredients {
                let reminder = EKReminder(eventStore: eventStore)
                reminder.title = ingredient
                reminder.calendar = list
                
                // Add note about which recipe
                reminder.notes = "From: \(item.title)"
                
                do {
                    try eventStore.save(reminder, commit: false)
                } catch {
                    print("Failed to save reminder: \(error)")
                }
            }
            
            do {
                try eventStore.commit()
                DispatchQueue.main.async {
                    withAnimation {
                        addedToList = true
                    }
                    Haptics.success()
                }
            } catch {
                print("Failed to commit reminders: \(error)")
            }
        }
    }
}

// MARK: - Supporting Views

struct StatPill: View {
    let icon: String
    let label: String
    let value: String
    
    var body: some View {
        VStack(spacing: 4) {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 12))
                Text(value)
                    .font(.system(size: 14, weight: .semibold))
            }
            .foregroundStyle(StashTheme.Color.textPrimary)
            
            Text(label)
                .font(.system(size: 11))
                .foregroundStyle(StashTheme.Color.textMuted)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

// MARK: - Preview

#Preview {
    NavigationStack {
        RecipeDetailView(item: .mockRecipe)
    }
}
