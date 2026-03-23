import SwiftUI

struct WorldMaxMachineView: View {
    let machineId: String
    @State private var machine: WorldMaxMachine?
    @State private var isLoading = true

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            if isLoading {
                ProgressView()
                    .tint(DojoTheme.piuAccent)
            } else if let machine {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        // Header
                        headerCard(machine)

                        // Details
                        detailsCard(machine)

                        // Photos
                        if let photos = machine.photos, !photos.isEmpty {
                            photosSection(photos)
                        }

                        // Notes
                        if let notes = machine.notes, !notes.isEmpty {
                            notesCard(notes)
                        }
                    }
                    .padding()
                }
            } else {
                VStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.system(size: 32))
                        .foregroundColor(DojoTheme.textMuted)
                    Text("Machine not found")
                        .foregroundColor(DojoTheme.textMuted)
                }
            }
        }
        .navigationTitle(machine?.name ?? "Machine")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadMachine() }
    }

    // MARK: - Header Card

    private func headerCard(_ machine: WorldMaxMachine) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(machine.name ?? "Unknown")
                .font(.system(size: 22, weight: .bold))
                .foregroundColor(.white)

            HStack(spacing: 8) {
                Image(systemName: "mappin.and.ellipse")
                    .font(.system(size: 14))
                    .foregroundColor(DojoTheme.piuAccent)

                VStack(alignment: .leading, spacing: 2) {
                    if let address = machine.address {
                        Text(address)
                            .font(.system(size: 13))
                            .foregroundColor(.white)
                    }
                    HStack(spacing: 4) {
                        if let city = machine.city {
                            Text(city)
                                .font(.system(size: 12))
                                .foregroundColor(DojoTheme.textSecondary)
                        }
                        if let country = machine.country {
                            Text(CountryData.flag(for: country))
                                .font(.system(size: 12))
                            Text(country)
                                .font(.system(size: 12))
                                .foregroundColor(DojoTheme.textSecondary)
                        }
                    }
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(DojoTheme.piuBorder, lineWidth: 1)
        )
    }

    // MARK: - Details Card

    private func detailsCard(_ machine: WorldMaxMachine) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("DETAILS")
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(DojoTheme.piuAccent)

            if let version = machine.gameVersion {
                detailRow(icon: "gamecontroller", label: "Game Version", value: version)
            }

            if let type = machine.machineType {
                detailRow(icon: "arcade.stick.console", label: "Machine Type", value: type)
            }

            if let pad = machine.padCondition {
                detailRow(icon: "figure.walk", label: "Pad Condition", value: pad, valueColor: padColor(pad))
            }
        }
        .padding(16)
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(DojoTheme.piuBorder, lineWidth: 1)
        )
    }

    private func detailRow(icon: String, label: String, value: String, valueColor: Color = .white) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 14))
                .foregroundColor(DojoTheme.piuBlue)
                .frame(width: 24)

            Text(label)
                .font(.system(size: 12))
                .foregroundColor(DojoTheme.textMuted)

            Spacer()

            Text(value)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(valueColor)
        }
    }

    // MARK: - Photos

    private func photosSection(_ photos: [String]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("PHOTOS")
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(DojoTheme.piuAccent)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(photos, id: \.self) { photo in
                        if let url = fullURL(photo) {
                            AsyncImage(url: url) { phase in
                                switch phase {
                                case .success(let image):
                                    image
                                        .resizable()
                                        .aspectRatio(contentMode: .fill)
                                        .frame(width: 140, height: 100)
                                        .clipShape(RoundedRectangle(cornerRadius: 8))
                                default:
                                    photoPlaceholder
                                }
                            }
                        } else {
                            photoPlaceholder
                        }
                    }
                }
            }
        }
        .padding(16)
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(DojoTheme.piuBorder, lineWidth: 1)
        )
    }

    private var photoPlaceholder: some View {
        ZStack {
            DojoTheme.piuDark
            Image(systemName: "photo")
                .foregroundColor(DojoTheme.textMuted)
        }
        .frame(width: 140, height: 100)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    // MARK: - Notes

    private func notesCard(_ notes: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("NOTES")
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(DojoTheme.piuAccent)

            Text(notes)
                .font(.system(size: 13))
                .foregroundColor(DojoTheme.textSecondary)
                .lineSpacing(4)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(DojoTheme.piuBorder, lineWidth: 1)
        )
    }

    // MARK: - Helpers

    private func padColor(_ condition: String) -> Color {
        switch condition.lowercased() {
        case "excellent", "great": return DojoTheme.piuGreen
        case "good": return DojoTheme.piuBlue
        case "fair", "average": return DojoTheme.piuGold
        case "poor", "bad": return DojoTheme.piuAccent
        default: return DojoTheme.textSecondary
        }
    }

    private func fullURL(_ path: String) -> URL? {
        if path.hasPrefix("http") { return URL(string: path) }
        let base = APIService.shared.baseURL
        let p = path.hasPrefix("/") ? path : "/\(path)"
        return URL(string: "\(base)\(p)")
    }

    private func loadMachine() async {
        isLoading = true
        machine = try? await APIService.shared.getWorldMaxMachine(machineId)
        isLoading = false
    }
}
