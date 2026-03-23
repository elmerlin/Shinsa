import SwiftUI

struct WorldMaxView: View {
    @State private var machines: [WorldMaxMachine] = []
    @State private var searchQuery = ""
    @State private var searchResults: [WorldMaxMachine]?
    @State private var showMap = false
    @State private var isLoading = true
    @State private var searchTask: Task<Void, Never>?

    private var displayMachines: [WorldMaxMachine] {
        searchResults ?? machines
    }

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            VStack(spacing: 0) {
                // Search bar
                searchBar

                // List/Map toggle
                toggleRow

                if isLoading {
                    Spacer()
                    ProgressView()
                        .tint(DojoTheme.piuAccent)
                    Spacer()
                } else if showMap {
                    mapPlaceholder
                } else {
                    machineList
                }
            }
        }
        .navigationTitle("World Max")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadMachines() }
    }

    // MARK: - Search Bar

    private var searchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 14))
                .foregroundColor(DojoTheme.textMuted)

            TextField("Search machines, cities...", text: $searchQuery)
                .font(.system(size: 14))
                .foregroundColor(.white)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .onChange(of: searchQuery) { _ in debouncedSearch() }

            if !searchQuery.isEmpty {
                Button {
                    searchQuery = ""
                    searchResults = nil
                    searchTask?.cancel()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 14))
                        .foregroundColor(DojoTheme.textMuted)
                }
            }
        }
        .padding(10)
        .background(DojoTheme.piuCard)
        .cornerRadius(10)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(DojoTheme.piuBorder, lineWidth: 1)
        )
        .padding(.horizontal)
        .padding(.top, 8)
    }

    // MARK: - Toggle

    private var toggleRow: some View {
        HStack(spacing: 8) {
            Button {
                withAnimation { showMap = false }
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "list.bullet")
                    Text("List")
                }
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(!showMap ? .white : DojoTheme.textMuted)
                .padding(.horizontal, 14)
                .padding(.vertical, 6)
                .background(!showMap ? DojoTheme.piuAccent : DojoTheme.piuCard)
                .cornerRadius(8)
            }

            Button {
                withAnimation { showMap = true }
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "map")
                    Text("Map")
                }
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(showMap ? .white : DojoTheme.textMuted)
                .padding(.horizontal, 14)
                .padding(.vertical, 6)
                .background(showMap ? DojoTheme.piuAccent : DojoTheme.piuCard)
                .cornerRadius(8)
            }

            Spacer()

            Text("\(displayMachines.count) machines")
                .font(.system(size: 11))
                .foregroundColor(DojoTheme.textMuted)
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
    }

    // MARK: - Machine List

    private var machineList: some View {
        Group {
            if displayMachines.isEmpty {
                VStack(spacing: 8) {
                    Spacer()
                    Image(systemName: "arcade.stick.console")
                        .font(.system(size: 32))
                        .foregroundColor(DojoTheme.textMuted.opacity(0.5))
                    Text("No machines found")
                        .font(.system(size: 14))
                        .foregroundColor(DojoTheme.textMuted)
                    Spacer()
                }
                .frame(maxWidth: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 2) {
                        ForEach(displayMachines) { machine in
                            NavigationLink(value: "world-max/\(machine.id)") {
                                machineRow(machine)
                            }
                        }
                    }
                    .padding(.top, 4)
                }
                .refreshable { await loadMachines() }
            }
        }
    }

    private func machineRow(_ machine: WorldMaxMachine) -> some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(DojoTheme.piuAccent.opacity(0.15))
                    .frame(width: 44, height: 44)
                Image(systemName: "arcade.stick.console")
                    .font(.system(size: 18))
                    .foregroundColor(DojoTheme.piuAccent)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(machine.name ?? "Unknown")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(1)

                HStack(spacing: 4) {
                    if let city = machine.city {
                        Text(city)
                            .font(.system(size: 12))
                            .foregroundColor(DojoTheme.textSecondary)
                    }
                    if let country = machine.country {
                        Text(CountryData.flag(for: country))
                            .font(.system(size: 12))
                    }
                }

                if let version = machine.gameVersion {
                    Text(version)
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(DojoTheme.piuBlue)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(DojoTheme.piuBlue.opacity(0.15))
                        .cornerRadius(4)
                }
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.system(size: 12))
                .foregroundColor(DojoTheme.textMuted)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(DojoTheme.piuCard)
    }

    // MARK: - Map Placeholder

    private var mapPlaceholder: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "map")
                .font(.system(size: 48))
                .foregroundColor(DojoTheme.textMuted.opacity(0.5))
            Text("Map view coming soon")
                .font(.system(size: 16, weight: .medium))
                .foregroundColor(DojoTheme.textMuted)
            Text("\(displayMachines.count) machines worldwide")
                .font(.system(size: 13))
                .foregroundColor(DojoTheme.textMuted.opacity(0.6))
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Helpers

    private func debouncedSearch() {
        searchTask?.cancel()
        let q = searchQuery.trimmingCharacters(in: .whitespaces)
        guard q.count >= 2 else {
            searchResults = nil
            return
        }
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled else { return }
            searchResults = (try? await APIService.shared.searchWorldMaxMachines(q)) ?? []
        }
    }

    private func loadMachines() async {
        isLoading = true
        machines = (try? await APIService.shared.getWorldMaxMachines()) ?? []
        isLoading = false
    }
}
