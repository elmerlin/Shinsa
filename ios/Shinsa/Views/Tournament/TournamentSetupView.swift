import SwiftUI

struct TournamentSetupView: View {
    @StateObject private var vm = TournamentSetupViewModel()
    @Environment(\.dismiss) var dismiss

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

                    // Round Robin Format
                    sectionHeader("ROUND ROBIN FORMAT")

                    formField("Number of Rounds") {
                        HStack {
                            Stepper("\(vm.totalRounds)", value: $vm.totalRounds, in: 1...10)
                                .foregroundColor(.white)
                        }
                        .onChange(of: vm.totalRounds) { _ in vm.updateLevels() }
                    }

                    // Difficulty Levels
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

                    // Gauntlet Settings
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

                    // Match Rules Info
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

                    // Error
                    if let err = vm.errorMessage {
                        Text(err)
                            .font(.system(size: 12))
                            .foregroundColor(.red)
                    }

                    // Save Button
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
                .padding()
            }
        }
        .navigationTitle("New Tournament")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { vm.updateLevels() }
    }

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
