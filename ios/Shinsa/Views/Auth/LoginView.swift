import SwiftUI

struct LoginView: View {
    @EnvironmentObject var auth: AuthManager
    @State private var username = ""
    @State private var password = ""
    @State private var errorMessage = ""
    @State private var isLoading = false
    @State private var showRegister = false
    @State private var showSettings = false
    @State private var serverURL = APIService.shared.baseURL

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 32) {
                    Spacer().frame(height: 60)

                    // Logo & Title
                    VStack(spacing: 8) {
                        HStack(spacing: 8) {
                            Text("PUMP")
                                .font(.system(size: 36, weight: .black))
                                .foregroundColor(DojoTheme.piuAccent)
                            Text("SHINSA")
                                .font(.system(size: 36, weight: .black))
                                .foregroundColor(DojoTheme.piuGold)
                        }
                        Text("Pump up your socials")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(DojoTheme.textSecondary)
                    }

                    // Login Form
                    VStack(spacing: 16) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Pump Alias")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(DojoTheme.textSecondary)
                            TextField("Your username", text: $username)
                                .textFieldStyle(.plain)
                                .padding(12)
                                .background(DojoTheme.piuDark)
                                .cornerRadius(8)
                                .overlay(RoundedRectangle(cornerRadius: 8).stroke(DojoTheme.piuBorder, lineWidth: 1))
                                .foregroundColor(.white)
                                .autocapitalization(.none)
                                .autocorrectionDisabled()
                        }

                        VStack(alignment: .leading, spacing: 6) {
                            Text("Password")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(DojoTheme.textSecondary)
                            SecureField("", text: $password)
                                .textFieldStyle(.plain)
                                .padding(12)
                                .background(DojoTheme.piuDark)
                                .cornerRadius(8)
                                .overlay(RoundedRectangle(cornerRadius: 8).stroke(DojoTheme.piuBorder, lineWidth: 1))
                                .foregroundColor(.white)
                        }

                        if !errorMessage.isEmpty {
                            Text(errorMessage)
                                .font(.system(size: 13))
                                .foregroundColor(.red)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }

                        Button {
                            performLogin()
                        } label: {
                            HStack {
                                if isLoading {
                                    ProgressView().tint(.white)
                                }
                                Text("Sign In")
                                    .font(.system(size: 16, weight: .bold))
                            }
                            .frame(maxWidth: .infinity)
                            .padding(14)
                            .background(DojoTheme.piuAccent)
                            .foregroundColor(.white)
                            .cornerRadius(8)
                        }
                        .disabled(isLoading || username.isEmpty || password.isEmpty)
                        .opacity(username.isEmpty || password.isEmpty ? 0.5 : 1)
                    }
                    .padding(24)
                    .background(DojoTheme.piuCard)
                    .cornerRadius(12)
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(DojoTheme.piuBorder, lineWidth: 1))

                    // Register Link
                    Button {
                        showRegister = true
                    } label: {
                        HStack(spacing: 4) {
                            Text("Don't have an account?")
                                .foregroundColor(DojoTheme.textSecondary)
                            Text("Register")
                                .foregroundColor(DojoTheme.piuAccent)
                                .fontWeight(.semibold)
                        }
                        .font(.system(size: 14))
                    }

                    Spacer()
                }
                .padding(.horizontal, 32)
            }
        }
        .navigationBarHidden(true)
        .navigationDestination(isPresented: $showRegister) {
            RegisterView()
        }
        .sheet(isPresented: $showSettings) {
            serverSettingsSheet
        }
    }

    private var serverSettingsSheet: some View {
        NavigationStack {
            ZStack {
                DojoTheme.piuBg.ignoresSafeArea()
                VStack(spacing: 16) {
                    Text("Enter the URL of your Shinsa server")
                        .font(.system(size: 14))
                        .foregroundColor(DojoTheme.textSecondary)
                        .multilineTextAlignment(.center)

                    TextField("http://localhost:3001", text: $serverURL)
                        .textFieldStyle(.plain)
                        .padding(12)
                        .background(DojoTheme.piuDark)
                        .cornerRadius(8)
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(DojoTheme.piuBorder, lineWidth: 1))
                        .foregroundColor(.white)
                        .autocapitalization(.none)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)

                    Button("Save") {
                        APIService.shared.setBaseURL(serverURL)
                        showSettings = false
                    }
                    .frame(maxWidth: .infinity)
                    .padding(12)
                    .background(DojoTheme.piuAccent)
                    .foregroundColor(.white)
                    .cornerRadius(8)

                    Spacer()
                }
                .padding(24)
            }
            .navigationTitle("Server Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { showSettings = false }
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func performLogin() {
        guard !username.isEmpty, !password.isEmpty else { return }
        isLoading = true
        errorMessage = ""
        Task {
            do {
                try await auth.login(username: username, password: password)
            } catch {
                errorMessage = error.localizedDescription
            }
            isLoading = false
        }
    }
}
