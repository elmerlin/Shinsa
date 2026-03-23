import SwiftUI

struct TournamentSetupView: View {
    @StateObject private var vm = TournamentSetupViewModel()
    @Environment(\.dismiss) var dismiss
    @State private var showFormatPicker = false

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    // General Info
                    sectionHeader("GENERAL INFO")

                    formField("Tournament Name") {
                        TextField("Enter tournament name", text: $vm.name)
                            .textFieldStyle(DojoTextFieldStyle())
                    }

                    formField("Location") {
                        TextField("e.g. Round1 Puente Hills", text: $vm.location)
                            .textFieldStyle(DojoTextFieldStyle())
                    }

                    formField("Date") {
                        DatePicker("", selection: $vm.date, displayedComponents: .date)
                            .datePickerStyle(.compact)
                            .tint(DojoTheme.piuAccent)
                            .labelsHidden()
                    }

                    // Mode Toggle
                    sectionHeader("TOURNAMENT MODE")

                    Picker("Mode", selection: $vm.useLegacyMode) {
                        Text("Multi-Phase").tag(false)
                        Text("Legacy (Simple)").tag(true)
                    }
                    .pickerStyle(.segmented)
                    .padding(4)
                    .background(DojoTheme.piuCard)
                    .cornerRadius(8)

                    if vm.useLegacyMode {
                        legacySetup
                    } else {
                        phaseSetup
                    }

                    // Error
                    if let err = vm.errorMessage {
                        Text(err)
                            .font(.system(size: 12))
                            .foregroundColor(.red)
                    }

                    // Save Button
                    saveButton
                }
                .padding()
            }
        }
        .navigationTitle("New Tournament")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { vm.updateLevels() }
        .sheet(isPresented: $vm.showPresetsSheet) {
            presetsSheet
        }
        .sheet(isPresented: $showFormatPicker) {
            formatPickerSheet
        }
    }

    // MARK: - Phase Setup

    @ViewBuilder
    private var phaseSetup: some View {
        // Presets button
        Button {
            vm.showPresetsSheet = true
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "wand.and.stars")
                    .font(.system(size: 13))
                Text("Browse Presets")
                    .font(.system(size: 13, weight: .bold))
            }
            .foregroundColor(DojoTheme.piuBlue)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(DojoTheme.piuBlue.opacity(0.12))
            .cornerRadius(8)
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(DojoTheme.piuBlue.opacity(0.3), lineWidth: 1)
            )
        }

        // Phase list
        sectionHeader("PHASES (\(vm.phaseEntries.count))")

        if vm.phaseEntries.isEmpty {
            VStack(spacing: 8) {
                Image(systemName: "square.stack.3d.up.slash")
                    .font(.system(size: 28))
                    .foregroundColor(DojoTheme.textMuted)
                Text("No phases added yet")
                    .font(.system(size: 13))
                    .foregroundColor(DojoTheme.textMuted)
                Text("Use a preset or add phases manually")
                    .font(.system(size: 11))
                    .foregroundColor(DojoTheme.textMuted.opacity(0.7))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 24)
        }

        ForEach(Array(vm.phaseEntries.enumerated()), id: \.element.id) { index, entry in
            PhaseConfigCard(
                entry: $vm.phaseEntries[index],
                phaseNumber: index + 1,
                isLast: index == vm.phaseEntries.count - 1,
                onRemove: { vm.removePhase(at: index) }
            )
        }

        // Add phase button
        Button {
            showFormatPicker = true
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "plus.circle.fill")
                    .font(.system(size: 14))
                Text("Add Phase")
                    .font(.system(size: 13, weight: .bold))
            }
            .foregroundColor(DojoTheme.piuAccent)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(DojoTheme.piuAccent.opacity(0.1))
            .cornerRadius(8)
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(DojoTheme.piuAccent.opacity(0.3), lineWidth: 1)
            )
        }
    }

    // MARK: - Legacy Setup

    @ViewBuilder
    private var legacySetup: some View {
        sectionHeader("ROUND ROBIN FORMAT")

        formField("Number of Rounds") {
            HStack {
                Stepper("\(vm.totalRounds)", value: $vm.totalRounds, in: 1...10)
                    .foregroundColor(.white)
            }
            .onChange(of: vm.totalRounds) { _ in vm.updateLevels() }
        }

        if !vm.levels.isEmpty {
            sectionHeader("DIFFICULTY LEVELS PER ROUND")

            ForEach($vm.levels) { $level in
                HStack(spacing: 12) {
                    Text("R\(level.round)")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(DojoTheme.piuAccent)
                        .frame(width: 30)

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Min")
                            .font(.system(size: 10))
                            .foregroundColor(DojoTheme.textMuted)
                        Stepper("\(level.min)", value: $level.min, in: 1...28)
                            .foregroundColor(.white)
                    }

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Max")
                            .font(.system(size: 10))
                            .foregroundColor(DojoTheme.textMuted)
                        Stepper("\(level.max)", value: $level.max, in: 1...28)
                            .foregroundColor(.white)
                    }
                }
                .padding(10)
                .background(DojoTheme.piuCard)
                .cornerRadius(8)
            }
        }

        sectionHeader("GAUNTLET")

        Toggle("Enable Gauntlet", isOn: $vm.gauntletEnabled)
            .tint(DojoTheme.piuAccent)
            .foregroundColor(.white)
            .padding(12)
            .background(DojoTheme.piuCard)
            .cornerRadius(8)

        if vm.gauntletEnabled {
            formField("Start Level") {
                Stepper("\(vm.gauntletStartLevel)", value: $vm.gauntletStartLevel, in: 1...28)
                    .foregroundColor(.white)
            }
            formField("Final Level") {
                Stepper("\(vm.gauntletFinalLevel)", value: $vm.gauntletFinalLevel, in: 1...28)
                    .foregroundColor(.white)
            }
        }

        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("MATCH RULES")
            VStack(alignment: .leading, spacing: 4) {
                ruleRow("Cards per draw", "5")
                ruleRow("Vetoes per player", "1")
                ruleRow("Best of", "3")
            }
            .padding(12)
            .background(DojoTheme.piuCard)
            .cornerRadius(8)
        }
    }

    // MARK: - Save Button

    private var saveButton: some View {
        Button {
            Task {
                if let _ = await vm.save() {
                    dismiss()
                }
            }
        } label: {
            HStack {
                if vm.saving {
                    ProgressView()
                        .tint(.white)
                        .scaleEffect(0.8)
                }
                Text("Create Tournament")
                    .font(.system(size: 16, weight: .bold))
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(DojoTheme.piuAccent)
            .cornerRadius(12)
        }
        .disabled(vm.saving)
    }

    // MARK: - Sheets

    private var presetsSheet: some View {
        NavigationView {
            ZStack {
                DojoTheme.piuBg.ignoresSafeArea()
                ScrollView {
                    TournamentPresetsView { preset in
                        vm.applyPreset(preset)
                    }
                    .padding()
                }
            }
            .navigationTitle("Tournament Presets")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { vm.showPresetsSheet = false }
                        .foregroundColor(DojoTheme.piuAccent)
                }
            }
        }
    }

    private var formatPickerSheet: some View {
        NavigationView {
            ZStack {
                DojoTheme.piuBg.ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 10) {
                        ForEach(TournamentFormat.allCases, id: \.rawValue) { format in
                            Button {
                                vm.addPhase(format)
                                showFormatPicker = false
                            } label: {
                                HStack(spacing: 12) {
                                    Image(systemName: format.icon)
                                        .font(.system(size: 18))
                                        .foregroundColor(DojoTheme.piuAccent)
                                        .frame(width: 36)

                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(format.label)
                                            .font(.system(size: 14, weight: .bold))
                                            .foregroundColor(.white)
                                        Text(format.description)
                                            .font(.system(size: 11))
                                            .foregroundColor(DojoTheme.textMuted)
                                    }

                                    Spacer()

                                    Image(systemName: "plus.circle")
                                        .foregroundColor(DojoTheme.piuAccent)
                                }
                                .padding(14)
                                .background(DojoTheme.piuCard)
                                .cornerRadius(10)
                            }
                        }
                    }
                    .padding()
                }
            }
            .navigationTitle("Select Format")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { showFormatPicker = false }
                        .foregroundColor(DojoTheme.piuAccent)
                }
            }
        }
    }

    // MARK: - Helpers

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 12, weight: .bold))
            .foregroundColor(DojoTheme.piuAccent)
            .tracking(1)
    }

    private func formField<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 12))
                .foregroundColor(DojoTheme.textMuted)
            content()
        }
    }

    private func ruleRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
                .font(.system(size: 13))
                .foregroundColor(DojoTheme.textSecondary)
            Spacer()
            Text(value)
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(.white)
        }
    }
}

// MARK: - Phase Config Card

struct PhaseConfigCard: View {
    @Binding var entry: TournamentSetupViewModel.PhaseEntry
    let phaseNumber: Int
    let isLast: Bool
    var onRemove: () -> Void

    @State private var isExpanded = false

    var body: some View {
        VStack(spacing: 0) {
            // Header (always visible)
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    isExpanded.toggle()
                }
            } label: {
                HStack(spacing: 10) {
                    ZStack {
                        Circle()
                            .fill(DojoTheme.piuAccent.opacity(0.2))
                            .frame(width: 28, height: 28)
                        Text("\(phaseNumber)")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(DojoTheme.piuAccent)
                    }

                    Image(systemName: entry.format.icon)
                        .font(.system(size: 13))
                        .foregroundColor(DojoTheme.piuAccent)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(entry.name)
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.white)
                        Text(entry.format.description)
                            .font(.system(size: 10))
                            .foregroundColor(DojoTheme.textMuted)
                            .lineLimit(1)
                    }

                    Spacer()

                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .font(.system(size: 11))
                        .foregroundColor(DojoTheme.textMuted)
                }
            }
            .padding(12)

            // Expanded config
            if isExpanded {
                Divider()
                    .background(DojoTheme.piuBorder)

                VStack(alignment: .leading, spacing: 12) {
                    // Phase name
                    TextField("Phase Name", text: $entry.name)
                        .textFieldStyle(DojoTextFieldStyle())
                        .font(.system(size: 13))

                    // Format-specific config
                    formatConfig

                    // Advancement (unless last phase)
                    if !isLast {
                        advancementConfig
                    }

                    // Remove button
                    Button(action: onRemove) {
                        HStack(spacing: 6) {
                            Image(systemName: "trash")
                                .font(.system(size: 11))
                            Text("Remove Phase")
                                .font(.system(size: 12, weight: .medium))
                        }
                        .foregroundColor(.red.opacity(0.8))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(Color.red.opacity(0.08))
                        .cornerRadius(6)
                    }
                }
                .padding(12)
            }
        }
        .background(DojoTheme.piuCard)
        .cornerRadius(10)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(DojoTheme.piuBorder.opacity(0.3), lineWidth: 1)
        )
    }

    // MARK: - Format-Specific Config

    @ViewBuilder
    private var formatConfig: some View {
        switch entry.format {
        case .roundRobin:
            configRow("Rounds") {
                Stepper("\(entry.config.rounds ?? 3)", value: binding(\.rounds, default: 3), in: 1...10)
            }
            configRow("Best Of") {
                Stepper("\(entry.config.bestOf ?? 3)", value: binding(\.bestOf, default: 3), in: 1...5)
            }

        case .pools:
            configRow("Pool Count") {
                Stepper("\(entry.config.poolCount ?? 4)", value: binding(\.poolCount, default: 4), in: 2...8)
            }
            configRow("Rounds per Pool") {
                Stepper("\(entry.config.roundsPerPool ?? 1)", value: binding(\.roundsPerPool, default: 1), in: 1...5)
            }
            difficultyConfig

        case .singleElim:
            difficultyConfig
            configRow("Best Of") {
                Stepper("\(entry.config.bestOf ?? 3)", value: binding(\.bestOf, default: 3), in: 1...5)
            }
            Toggle("3rd Place Match", isOn: Binding(
                get: { entry.config.thirdPlaceMatch ?? true },
                set: { entry.config.thirdPlaceMatch = $0 }
            ))
            .tint(DojoTheme.piuAccent)
            .foregroundColor(.white)
            .font(.system(size: 13))

        case .doubleElim:
            difficultyConfig
            configRow("Best Of") {
                Stepper("\(entry.config.bestOf ?? 3)", value: binding(\.bestOf, default: 3), in: 1...5)
            }
            Toggle("Grand Final Reset", isOn: Binding(
                get: { entry.config.grandFinalReset ?? true },
                set: { entry.config.grandFinalReset = $0 }
            ))
            .tint(DojoTheme.piuAccent)
            .foregroundColor(.white)
            .font(.system(size: 13))

        case .gauntlet:
            configRow("Start Level") {
                Stepper("\(entry.config.startSingleLevel ?? 19)", value: binding(\.startSingleLevel, default: 19), in: 1...28)
            }
            configRow("Final Level") {
                Stepper("\(entry.config.finalSingleLevel ?? 24)", value: binding(\.finalSingleLevel, default: 24), in: 1...28)
            }

        case .hourOfPower, .b15:
            difficultyConfig
            configRow("Duration (min)") {
                Stepper("\(entry.config.durationMinutes ?? 60)", value: binding(\.durationMinutes, default: 60), in: 15...120)
            }
        }
    }

    private var difficultyConfig: some View {
        Group {
            configRow("Min Level") {
                Stepper("\(entry.config.difficultyMin ?? 18)", value: binding(\.difficultyMin, default: 18), in: 1...28)
            }
            configRow("Max Level") {
                Stepper("\(entry.config.difficultyMax ?? 23)", value: binding(\.difficultyMax, default: 23), in: 1...28)
            }
        }
    }

    // MARK: - Advancement Config

    private var advancementConfig: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("ADVANCEMENT")
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(DojoTheme.piuGold)
                .tracking(0.5)

            Picker("Type", selection: $entry.advancement.type) {
                Text("All Players").tag("all")
                Text("Top N").tag("top_n")
                Text("Top N per Pool").tag("per_pool_top_n")
                Text("Points Threshold").tag("threshold")
            }
            .pickerStyle(.menu)
            .tint(DojoTheme.piuAccent)
            .foregroundColor(.white)
            .font(.system(size: 13))

            if entry.advancement.type == "top_n" || entry.advancement.type == "per_pool_top_n" {
                configRow("Advance Count") {
                    Stepper("\(entry.advancement.count ?? 4)", value: Binding(
                        get: { entry.advancement.count ?? 4 },
                        set: { entry.advancement.count = $0 }
                    ), in: 1...32)
                }
            }

            if entry.advancement.type == "threshold" {
                configRow("Min Points") {
                    Stepper("\(entry.advancement.points ?? 6)", value: Binding(
                        get: { entry.advancement.points ?? 6 },
                        set: { entry.advancement.points = $0 }
                    ), in: 1...100)
                }
            }
        }
        .padding(10)
        .background(DojoTheme.piuGold.opacity(0.05))
        .cornerRadius(8)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(DojoTheme.piuGold.opacity(0.15), lineWidth: 1)
        )
    }

    // MARK: - Helpers

    private func configRow<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        HStack {
            Text(label)
                .font(.system(size: 12))
                .foregroundColor(DojoTheme.textSecondary)
            Spacer()
            content()
                .foregroundColor(.white)
                .font(.system(size: 13))
        }
    }

    private func binding<T>(_ keyPath: WritableKeyPath<PhaseConfig, T?>, default defaultValue: T) -> Binding<T> {
        Binding(
            get: { entry.config[keyPath: keyPath] ?? defaultValue },
            set: { entry.config[keyPath: keyPath] = $0 }
        )
    }
}

// MARK: - Dojo TextField Style

struct DojoTextFieldStyle: TextFieldStyle {
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .padding(12)
            .background(DojoTheme.piuCard)
            .foregroundColor(.white)
            .cornerRadius(8)
    }
}
