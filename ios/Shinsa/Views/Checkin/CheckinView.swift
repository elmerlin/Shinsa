import SwiftUI

struct CheckinView: View {
    @State private var status: CheckinStatus?
    @State private var venues: [Venue] = []
    @State private var history: [CheckinHistory] = []
    @State private var selectedVenueId: String?
    @State private var isLoading = false
    @State private var isActioning = false
    @State private var errorMessage: String?

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 16) {
                    statusCard
                    playingStatusSection
                    historySection
                }
                .padding()
            }
            .refreshable { await loadAll() }
        }
        .navigationTitle("Check-in")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadAll() }
    }

    // MARK: - Status Card

    @ViewBuilder
    private var statusCard: some View {
        VStack(spacing: 14) {
            if isLoading && status == nil {
                ProgressView().tint(DojoTheme.piuAccent)
                    .padding(.vertical, 30)
            } else if status?.isCheckedIn == true {
                // Checked in
                HStack(spacing: 8) {
                    Image(systemName: "mappin.circle.fill")
                        .font(.system(size: 20))
                        .foregroundColor(DojoTheme.piuGreen)
                    Text("CHECKED IN")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(DojoTheme.piuGreen)
                }

                Text(status?.venueName ?? "Unknown Venue")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(.white)

                if let time = status?.checkinTime {
                    Text("Since \(formatTime(time))")
                        .font(.system(size: 12))
                        .foregroundColor(DojoTheme.textMuted)
                }

                Button {
                    Task { await doCheckout() }
                } label: {
                    HStack(spacing: 6) {
                        if isActioning { ProgressView().tint(.white).scaleEffect(0.8) }
                        Image(systemName: "arrow.right.circle")
                        Text("Check Out")
                            .font(.system(size: 14, weight: .bold))
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(DojoTheme.piuAccent)
                    .cornerRadius(10)
                }
                .disabled(isActioning)
            } else {
                // Not checked in
                HStack(spacing: 8) {
                    Image(systemName: "mappin.slash")
                        .font(.system(size: 20))
                        .foregroundColor(DojoTheme.textMuted)
                    Text("NOT CHECKED IN")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(DojoTheme.textMuted)
                }

                if venues.isEmpty {
                    Text("No venues available")
                        .font(.system(size: 13))
                        .foregroundColor(DojoTheme.textMuted)
                } else {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("SELECT VENUE")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(DojoTheme.textMuted)

                        ForEach(venues) { venue in
                            Button {
                                selectedVenueId = venue.id
                            } label: {
                                HStack(spacing: 10) {
                                    Image(systemName: selectedVenueId == venue.id ? "checkmark.circle.fill" : "circle")
                                        .foregroundColor(selectedVenueId == venue.id ? DojoTheme.piuAccent : DojoTheme.textMuted)

                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(venue.name ?? "Unnamed")
                                            .font(.system(size: 14, weight: .medium))
                                            .foregroundColor(.white)
                                        if let city = venue.city {
                                            Text(city)
                                                .font(.system(size: 11))
                                                .foregroundColor(DojoTheme.textMuted)
                                        }
                                    }

                                    Spacer()

                                    if let count = venue.activeUsers, count > 0 {
                                        HStack(spacing: 3) {
                                            Image(systemName: "person.fill")
                                                .font(.system(size: 10))
                                            Text("\(count)")
                                                .font(.system(size: 11))
                                        }
                                        .foregroundColor(DojoTheme.piuGreen)
                                    }
                                }
                                .padding(10)
                                .background(selectedVenueId == venue.id ? DojoTheme.piuAccent.opacity(0.1) : Color.clear)
                                .cornerRadius(8)
                            }
                        }
                    }

                    Button {
                        Task { await doCheckin() }
                    } label: {
                        HStack(spacing: 6) {
                            if isActioning { ProgressView().tint(.white).scaleEffect(0.8) }
                            Image(systemName: "mappin.and.ellipse")
                            Text("Check In")
                                .font(.system(size: 14, weight: .bold))
                        }
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(selectedVenueId != nil ? DojoTheme.piuGreen : DojoTheme.textMuted)
                        .cornerRadius(10)
                    }
                    .disabled(selectedVenueId == nil || isActioning)
                }
            }

            if let err = errorMessage {
                Text(err)
                    .font(.system(size: 12))
                    .foregroundColor(.red)
            }
        }
        .padding()
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
    }

    // MARK: - Playing Status

    @ViewBuilder
    private var playingStatusSection: some View {
        if status?.isCheckedIn == true {
            VStack(alignment: .leading, spacing: 10) {
                Text("PLAYING STATUS")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(DojoTheme.piuAccent)

                HStack(spacing: 12) {
                    playingStatusButton("Playing", icon: "gamecontroller.fill", value: "playing")
                    playingStatusButton("Resting", icon: "pause.circle.fill", value: "resting")
                    playingStatusButton("Watching", icon: "eye.fill", value: "watching")
                }
            }
            .padding()
            .background(DojoTheme.piuCard)
            .cornerRadius(12)
        }
    }

    private func playingStatusButton(_ label: String, icon: String, value: String) -> some View {
        let isActive = status?.playingStatus == value
        return Button {
            Task { await updatePlaying(value) }
        } label: {
            VStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 18))
                Text(label)
                    .font(.system(size: 11, weight: .bold))
            }
            .foregroundColor(isActive ? DojoTheme.piuAccent : DojoTheme.textMuted)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(isActive ? DojoTheme.piuAccent.opacity(0.15) : Color.white.opacity(0.03))
            .cornerRadius(10)
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(isActive ? DojoTheme.piuAccent : DojoTheme.piuBorder, lineWidth: 1)
            )
        }
    }

    // MARK: - History

    private var historySection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("CHECK-IN HISTORY")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(DojoTheme.piuAccent)

            if history.isEmpty {
                Text("No check-in history")
                    .font(.system(size: 13))
                    .foregroundColor(DojoTheme.textMuted)
                    .padding(.vertical, 16)
                    .frame(maxWidth: .infinity)
            } else {
                ForEach(history) { entry in
                    HStack(spacing: 10) {
                        Image(systemName: "mappin")
                            .font(.system(size: 12))
                            .foregroundColor(DojoTheme.piuAccent)
                            .frame(width: 24)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(entry.venueName ?? "Unknown")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(.white)
                            if let time = entry.checkinTime {
                                Text(formatTime(time))
                                    .font(.system(size: 11))
                                    .foregroundColor(DojoTheme.textMuted)
                            }
                        }

                        Spacer()

                        if let dur = entry.duration {
                            Text(formatDuration(dur))
                                .font(.system(size: 11))
                                .foregroundColor(DojoTheme.textMuted)
                        }
                    }
                    .padding(10)
                    .background(DojoTheme.piuCard)
                    .cornerRadius(8)
                }
            }
        }
    }

    // MARK: - Actions

    private func loadAll() async {
        isLoading = true
        async let s = APIService.shared.getCheckinStatus()
        async let v = APIService.shared.getVenues()
        async let h = APIService.shared.getCheckinHistory()
        status = try? await s
        venues = (try? await v) ?? []
        history = (try? await h) ?? []
        isLoading = false
    }

    private func doCheckin() async {
        guard let venueId = selectedVenueId else { return }
        isActioning = true
        errorMessage = nil
        do {
            _ = try await APIService.shared.checkin(venueId: venueId, lat: 0, lng: 0)
            await loadAll()
        } catch {
            errorMessage = error.localizedDescription
        }
        isActioning = false
    }

    private func doCheckout() async {
        isActioning = true
        errorMessage = nil
        do {
            _ = try await APIService.shared.checkout()
            await loadAll()
        } catch {
            errorMessage = error.localizedDescription
        }
        isActioning = false
    }

    private func updatePlaying(_ value: String) async {
        _ = try? await APIService.shared.updatePlayingStatus(value)
        status = try? await APIService.shared.getCheckinStatus()
    }

    // MARK: - Formatters

    private func formatTime(_ iso: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: iso) {
            let df = DateFormatter()
            df.dateStyle = .medium
            df.timeStyle = .short
            return df.string(from: date)
        }
        return iso
    }

    private func formatDuration(_ minutes: Int) -> String {
        if minutes < 60 { return "\(minutes)m" }
        return "\(minutes / 60)h \(minutes % 60)m"
    }
}
