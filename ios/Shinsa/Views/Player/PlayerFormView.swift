import SwiftUI

struct PlayerFormView: View {
    @StateObject private var vm: PlayerViewModel
    @Environment(\.dismiss) var dismiss
    let onSave: (Player) -> Void

    init(tournamentId: String, player: Player? = nil, onSave: @escaping (Player) -> Void) {
        _vm = StateObject(wrappedValue: PlayerViewModel(tournamentId: tournamentId, player: player))
        self.onSave = onSave
    }

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // User Search (only for new players)
                    if vm.editingPlayer == nil {
                        userSearchSection
                    }

                    // Player Name
                    formField("Player Name") {
                        TextField("Enter name", text: $vm.name)
                            .textFieldStyle(DojoTextFieldStyle())
                    }

                    // Pumbility (only for new players)
                    if vm.editingPlayer == nil {
                        formField("Pumbility / Seeding") {
                            TextField("e.g. 1200", text: $vm.pumbility)
                                .textFieldStyle(DojoTextFieldStyle())
                                .keyboardType(.numberPad)
                        }
                    }

                    // Skill Title & Level
                    HStack(spacing: 12) {
                        formField("Skill Title") {
                            Picker("", selection: $vm.skillTitle) {
                                ForEach(PlayerViewModel.skillTitles, id: \.self) { title in
                                    Text(title).tag(title)
                                }
                            }
                            .pickerStyle(.menu)
                            .tint(DojoTheme.skillColor(for: vm.skillTitle))
                        }

                        formField("Level") {
                            Picker("", selection: $vm.skillLevel) {
                                ForEach(1...10, id: \.self) { level in
                                    Text("\(level)").tag(level)
                                }
                            }
                            .pickerStyle(.menu)
                            .tint(.white)
                        }
                    }

                    // Gender
                    formField("Gender") {
                        Picker("", selection: $vm.gender) {
                            ForEach(PlayerViewModel.genderOptions, id: \.0) { value, label in
                                Text(label).tag(value)
                            }
                        }
                        .pickerStyle(.segmented)
                    }

                    // Nationality
                    formField("Nationality") {
                        NavigationLink {
                            CountryPickerView(selected: $vm.nationality)
                        } label: {
                            HStack {
                                if vm.nationality.isEmpty {
                                    Text("Select country")
                                        .foregroundColor(DojoTheme.textMuted)
                                } else {
                                    Text("\(CountryData.flag(for: vm.nationality)) \(CountryData.name(for: vm.nationality))")
                                        .foregroundColor(.white)
                                }
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .foregroundColor(DojoTheme.textMuted)
                            }
                            .padding(12)
                            .background(DojoTheme.piuCard)
                            .cornerRadius(8)
                        }
                    }

                    // Description
                    formField("Description") {
                        TextEditor(text: $vm.description)
                            .frame(minHeight: 60)
                            .padding(8)
                            .background(DojoTheme.piuCard)
                            .foregroundColor(.white)
                            .cornerRadius(8)
                            .scrollContentBackground(.hidden)
                    }

                    // Skill Preview
                    if !vm.name.isEmpty {
                        HStack(spacing: 8) {
                            AvatarView(vm.avatar, name: vm.name, size: 36)
                            VStack(alignment: .leading, spacing: 2) {
                                HStack(spacing: 4) {
                                    Text(vm.name)
                                        .font(.system(size: 14, weight: .bold))
                                        .foregroundColor(.white)
                                    if !vm.nationality.isEmpty {
                                        Text(CountryData.flag(for: vm.nationality))
                                    }
                                }
                                HStack(spacing: 4) {
                                    Text(vm.skillTitle)
                                        .font(.system(size: 11, weight: .bold))
                                        .foregroundColor(DojoTheme.skillColor(for: vm.skillTitle))
                                    Text("Lv.\(vm.skillLevel)")
                                        .font(.system(size: 11))
                                        .foregroundColor(DojoTheme.textMuted)
                                }
                            }
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
                            if let player = await vm.save() {
                                onSave(player)
                                dismiss()
                            }
                        }
                    } label: {
                        HStack {
                            if vm.saving {
                                ProgressView().tint(.white).scaleEffect(0.8)
                            }
                            Text(vm.editingPlayer != nil ? "Update Player" : "Add Player")
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
        .navigationTitle(vm.editingPlayer != nil ? "Edit Player" : "Add Player")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button("Cancel") { dismiss() }
                    .foregroundColor(DojoTheme.piuAccent)
            }
        }
    }

    // MARK: - User Search

    private var userSearchSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("LINK REGISTERED USER")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(DojoTheme.piuAccent)

            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(DojoTheme.textMuted)
                TextField("Search users...", text: Binding(
                    get: { vm.userSearchQuery },
                    set: { vm.searchUsers($0) }
                ))
                .foregroundColor(.white)
                .autocorrectionDisabled()

                if vm.isSearching {
                    ProgressView().scaleEffect(0.7).tint(DojoTheme.textMuted)
                }
            }
            .padding(10)
            .background(DojoTheme.piuCard)
            .cornerRadius(8)

            if !vm.userSearchResults.isEmpty {
                VStack(spacing: 2) {
                    ForEach(vm.userSearchResults) { user in
                        Button {
                            vm.selectUser(user)
                        } label: {
                            HStack(spacing: 8) {
                                AvatarView(user.avatar, name: user.username, size: 28)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(user.username)
                                        .font(.system(size: 13, weight: .medium))
                                        .foregroundColor(.white)
                                    if let skill = user.skillTitle {
                                        Text(skill)
                                            .font(.system(size: 10))
                                            .foregroundColor(DojoTheme.skillColor(for: skill))
                                    }
                                }
                                Spacer()
                            }
                            .padding(8)
                            .background(DojoTheme.piuDark)
                            .cornerRadius(6)
                        }
                    }
                }
            }

            if let uid = vm.userId {
                HStack(spacing: 6) {
                    Image(systemName: "link")
                        .foregroundColor(DojoTheme.piuGreen)
                    Text("Linked to registered user")
                        .font(.system(size: 11))
                        .foregroundColor(DojoTheme.piuGreen)
                    Spacer()
                    Button {
                        vm.userId = nil
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(DojoTheme.textMuted)
                    }
                }
                .padding(8)
                .background(DojoTheme.piuGreen.opacity(0.1))
                .cornerRadius(6)
            }
        }
    }

    private func formField<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 12))
                .foregroundColor(DojoTheme.textMuted)
            content()
        }
    }
}
