import SwiftUI

struct RegisterView: View {
    @EnvironmentObject var auth: AuthManager
    @Environment(\.dismiss) var dismiss
    @State private var username = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var email = ""
    @State private var skillTitle = "Beginner"
    @State private var skillLevel = 1
    @State private var gender = ""
    @State private var nationality = ""
    @State private var bio = ""
    @State private var errorMessage = ""
    @State private var isLoading = false

    private let skillTitles = ["Beginner", "Intermediate", "Advanced", "Expert"]

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 16) {
                    // Title
                    Text("Create Account")
                        .font(.system(size: 24, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.top, 16)

                    // Form
                    VStack(spacing: 14) {
                        formField("Username", text: $username, autocap: false)
                        formField("Email", text: $email, autocap: false, keyboard: .emailAddress)
                        secureField("Password", text: $password)
                        secureField("Confirm Password", text: $confirmPassword)

                        // Skill Title
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Skill Title")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(DojoTheme.textSecondary)
                            Picker("", selection: $skillTitle) {
                                ForEach(skillTitles, id: \.self) { Text($0) }
                            }
                            .pickerStyle(.segmented)
                        }

                        // Skill Level
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Skill Level: \(skillLevel)")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(DojoTheme.textSecondary)
                            Picker("", selection: $skillLevel) {
                                ForEach(1...10, id: \.self) { Text("\($0)").tag($0) }
                            }
                            .pickerStyle(.segmented)
                        }

                        // Gender
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Gender")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(DojoTheme.textSecondary)
                            Picker("", selection: $gender) {
                                Text("Not specified").tag("")
                                Text("Male").tag("male")
                                Text("Female").tag("female")
                            }
                            .pickerStyle(.segmented)
                        }

                        // Nationality
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Nationality")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(DojoTheme.textSecondary)
                            NavigationLink {
                                CountryPickerView(selected: $nationality)
                            } label: {
                                HStack {
                                    Text(nationality.isEmpty ? "Select country" : CountryData.name(for: nationality))
                                        .foregroundColor(nationality.isEmpty ? DojoTheme.textMuted : .white)
                                    Spacer()
                                    if !nationality.isEmpty {
                                        Text(CountryData.flag(for: nationality))
                                    }
                                    Image(systemName: "chevron.right")
                                        .foregroundColor(DojoTheme.textMuted)
                                }
                                .padding(12)
                                .background(DojoTheme.piuDark)
                                .cornerRadius(8)
                                .overlay(RoundedRectangle(cornerRadius: 8).stroke(DojoTheme.piuBorder, lineWidth: 1))
                            }
                        }

                        // Bio
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Bio")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(DojoTheme.textSecondary)
                            TextEditor(text: $bio)
                                .frame(height: 80)
                                .padding(8)
                                .background(DojoTheme.piuDark)
                                .cornerRadius(8)
                                .overlay(RoundedRectangle(cornerRadius: 8).stroke(DojoTheme.piuBorder, lineWidth: 1))
                                .foregroundColor(.white)
                                .scrollContentBackground(.hidden)
                        }

                        if !errorMessage.isEmpty {
                            Text(errorMessage)
                                .font(.system(size: 13))
                                .foregroundColor(.red)
                        }

                        Button {
                            performRegister()
                        } label: {
                            HStack {
                                if isLoading { ProgressView().tint(.white) }
                                Text("Create Account")
                                    .font(.system(size: 16, weight: .bold))
                            }
                            .frame(maxWidth: .infinity)
                            .padding(14)
                            .background(DojoTheme.piuAccent)
                            .foregroundColor(.white)
                            .cornerRadius(8)
                        }
                        .disabled(isLoading || !isFormValid)
                        .opacity(isFormValid ? 1 : 0.5)
                    }
                    .padding(24)
                    .background(DojoTheme.piuCard)
                    .cornerRadius(12)
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(DojoTheme.piuBorder, lineWidth: 1))
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 32)
            }
        }
        .navigationTitle("Register")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var isFormValid: Bool {
        !username.isEmpty && !password.isEmpty && password == confirmPassword && password.count >= 3
    }

    private func formField(_ label: String, text: Binding<String>, autocap: Bool = true, keyboard: UIKeyboardType = .default) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(DojoTheme.textSecondary)
            TextField("", text: text)
                .textFieldStyle(.plain)
                .padding(12)
                .background(DojoTheme.piuDark)
                .cornerRadius(8)
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(DojoTheme.piuBorder, lineWidth: 1))
                .foregroundColor(.white)
                .autocapitalization(autocap ? .words : .none)
                .autocorrectionDisabled()
                .keyboardType(keyboard)
        }
    }

    private func secureField(_ label: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(DojoTheme.textSecondary)
            SecureField("", text: text)
                .textFieldStyle(.plain)
                .padding(12)
                .background(DojoTheme.piuDark)
                .cornerRadius(8)
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(DojoTheme.piuBorder, lineWidth: 1))
                .foregroundColor(.white)
        }
    }

    private func performRegister() {
        guard isFormValid else { return }
        isLoading = true
        errorMessage = ""
        Task {
            do {
                try await auth.register(
                    username: username, password: password, email: email, avatar: "",
                    skillTitle: "\(skillTitle) lvl. \(skillLevel)", skillLevel: skillLevel,
                    gender: gender, nationality: nationality, description: bio
                )
            } catch {
                errorMessage = error.localizedDescription
            }
            isLoading = false
        }
    }
}
