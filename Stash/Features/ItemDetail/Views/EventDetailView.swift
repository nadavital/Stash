import SwiftUI
import MapKit
import EventKit

/// Native event detail view with MapKit and EventKit integration
/// - Preview: Event info, venue map, AI summary
/// - Engage: Full event page WebView
/// - Act: Add to Calendar, Get Directions, Buy Tickets
struct EventDetailView: View {
    let item: ItemSummary
    
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    
    @State private var liked: Bool? = nil
    @State private var showShareSheet = false
    @State private var showFullEvent = false
    @State private var addedToCalendar = false
    @State private var showCalendarAlert = false
    @State private var region: MKCoordinateRegion
    
    private let actionsManager = ItemActionsManager.shared
    
    // Event metadata
    private var venueName: String {
        item.metadata.venueName ?? "Venue"
    }
    
    private var venueAddress: String {
        item.metadata.venueAddress ?? ""
    }
    
    private var hasLocation: Bool {
        item.metadata.latitude != nil && item.metadata.longitude != nil
    }
    
    private var eventDate: Date? {
        item.metadata.startDate
    }
    
    private var ticketUrl: String? {
        item.metadata.ticketUrl ?? item.canonicalUrl
    }
    
    init(item: ItemSummary) {
        self.item = item
        
        // Initialize map region
        let lat = item.metadata.latitude ?? 37.7749
        let lon = item.metadata.longitude ?? -122.4194
        _region = State(initialValue: MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: lat, longitude: lon),
            span: MKCoordinateSpan(latitudeDelta: 0.01, longitudeDelta: 0.01)
        ))
    }
    
    var body: some View {
        ZStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    // Map header (if location available)
                    if hasLocation {
                        mapSection
                    }
                    
                    // Content
                    VStack(alignment: .leading, spacing: Spacing.xl) {
                        // Event title and date
                        headerSection
                        
                        // Venue info
                        venueSection
                        
                        // AI Summary
                        aiSummarySection
                        
                        // Add to calendar button
                        addToCalendarButton
                        
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
                    primaryActionLabel: hasLocation ? "Directions" : "View Event",
                    primaryActionIcon: hasLocation ? "location.fill" : "globe",
                    onPrimaryAction: {
                        if hasLocation {
                            openInMaps()
                        } else {
                            showFullEvent = true
                        }
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
        .sheet(isPresented: $showFullEvent) {
            NavigationStack {
                ContentDetailView(item: item)
            }
        }
        .sheet(isPresented: $showShareSheet) {
            if let urlString = item.canonicalUrl, let url = URL(string: urlString) {
                ShareSheet(items: [url])
            }
        }
        .alert("Add to Calendar", isPresented: $showCalendarAlert) {
            Button("Add Event") {
                addToCalendar()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Add \"\(item.title)\" to your calendar?")
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
    
    // MARK: - Add to Calendar Button
    
    private var addToCalendarButton: some View {
        Button {
            Haptics.light()
            showCalendarAlert = true
        } label: {
            HStack(spacing: 8) {
                Image(systemName: addedToCalendar ? "checkmark.circle.fill" : "calendar.badge.plus")
                    .font(.system(size: 14, weight: .semibold))
                Text(addedToCalendar ? "Added to Calendar" : "Add to Calendar")
                    .font(.system(size: 14, weight: .semibold))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
        }
        .glassEffect(addedToCalendar ? .regular.tint(.green) : .regular, in: .rect(cornerRadius: 12))
        .buttonStyle(.plain)
    }
    
    // MARK: - Map Section
    
    private var mapSection: some View {
        ZStack(alignment: .bottomLeading) {
            Map(coordinateRegion: .constant(region), annotationItems: [MapPin(coordinate: region.center)]) { pin in
                MapAnnotation(coordinate: pin.coordinate) {
                    VStack(spacing: 0) {
                        Image(systemName: "mappin.circle.fill")
                            .font(.system(size: 30))
                            .foregroundStyle(StashTheme.Color.accent)
                        
                        Image(systemName: "arrowtriangle.down.fill")
                            .font(.system(size: 10))
                            .foregroundStyle(StashTheme.Color.accent)
                            .offset(y: -5)
                    }
                }
            }
            .frame(height: 200)
            .allowsHitTesting(false) // Prevent map interaction in scroll view
            
            // Gradient overlay
            LinearGradient(
                colors: [.clear, StashTheme.Color.bg.opacity(0.3), StashTheme.Color.bg],
                startPoint: .top,
                endPoint: .bottom
            )
            .frame(height: 100)
            .offset(y: 100)
        }
        .frame(height: 200)
    }
    
    // MARK: - Header Section
    
    private var headerSection: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            // Type pill
            HStack(spacing: 6) {
                Text(item.primaryEmoji)
                    .font(.system(size: 14))
                Text("Event")
                    .font(.system(size: 12, weight: .semibold))
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(.ultraThinMaterial)
            .clipShape(Capsule())
            
            Text(item.title)
                .font(.system(size: 24, weight: .bold))
                .foregroundStyle(StashTheme.Color.textPrimary)
            
            // Date and time
            if let date = eventDate {
                HStack(spacing: Spacing.md) {
                    Image(systemName: "calendar")
                        .font(.system(size: 14))
                        .foregroundStyle(StashTheme.Color.accent)
                    
                    Text(date.formatted(date: .long, time: .shortened))
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(StashTheme.Color.textSecondary)
                }
            }
        }
    }
    
    // MARK: - Venue Section
    
    private var venueSection: some View {
        Button {
            if hasLocation {
                openInMaps()
            }
        } label: {
            HStack(spacing: Spacing.md) {
                Image(systemName: "mappin.and.ellipse")
                    .font(.system(size: 20))
                    .foregroundStyle(StashTheme.Color.accent)
                    .frame(width: 40, height: 40)
                    .background(StashTheme.Color.accent.opacity(0.15))
                    .clipShape(Circle())
                
                VStack(alignment: .leading, spacing: 2) {
                    Text(venueName)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(StashTheme.Color.textPrimary)
                    
                    if !venueAddress.isEmpty {
                        Text(venueAddress)
                            .font(.system(size: 14))
                            .foregroundStyle(StashTheme.Color.textMuted)
                            .lineLimit(2)
                    }
                }
                
                Spacer()
                
                if hasLocation {
                    Image(systemName: "arrow.up.right")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(StashTheme.Color.textMuted)
                }
            }
            .padding(Spacing.md)
            .background(.ultraThinMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
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
    
    // MARK: - Calendar Integration
    
    private func addToCalendar() {
        let eventStore = EKEventStore()
        
        eventStore.requestFullAccessToEvents { granted, error in
            guard granted, error == nil else {
                print("Calendar access denied")
                return
            }
            
            let event = EKEvent(eventStore: eventStore)
            event.title = item.title
            event.notes = item.summary
            event.location = venueAddress.isEmpty ? venueName : "\(venueName), \(venueAddress)"
            
            if let startDate = item.metadata.startDate {
                event.startDate = startDate
                event.endDate = item.metadata.endDate ?? startDate.addingTimeInterval(3600 * 2) // Default 2 hours
            } else {
                event.startDate = Date()
                event.endDate = Date().addingTimeInterval(3600 * 2)
            }
            
            if let url = item.canonicalUrl {
                event.url = URL(string: url)
            }
            
            event.calendar = eventStore.defaultCalendarForNewEvents
            
            do {
                try eventStore.save(event, span: .thisEvent)
                DispatchQueue.main.async {
                    withAnimation {
                        addedToCalendar = true
                    }
                    Haptics.success()
                }
            } catch {
                print("Failed to save event: \(error)")
            }
        }
    }
    
    // MARK: - Maps Integration
    
    private func openInMaps() {
        guard let lat = item.metadata.latitude, let lon = item.metadata.longitude else { return }
        
        let coordinate = CLLocationCoordinate2D(latitude: lat, longitude: lon)
        let placemark = MKPlacemark(coordinate: coordinate)
        let mapItem = MKMapItem(placemark: placemark)
        mapItem.name = venueName
        
        mapItem.openInMaps(launchOptions: [
            MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDriving
        ])
    }
}

// MARK: - Map Pin

struct MapPin: Identifiable {
    let id = UUID()
    let coordinate: CLLocationCoordinate2D
}

// MARK: - Preview

#Preview {
    NavigationStack {
        EventDetailView(item: .mockEvent)
    }
}
