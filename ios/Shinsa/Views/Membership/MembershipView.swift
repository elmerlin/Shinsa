import SwiftUI

struct MembershipView: View {
    let venueSlug: String

    @State private var accessStatus: VenueAccessStatus?
    @State private var plans: [VenuePlan] = []
    @State private var isLoading = false
    @State private var isPurchasing = false
    @State private var errorMessage: String?
    @State private var successMessage: String?

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 16) {
                    accessStatusCard
                    activeMembershipCard
                    plansSection
                }
                .padding()
            }
            .refreshable { await loadAll() }
        }
        .navigationTitle("Membership")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadAll() }
    }

    // MARK: - Access Status

    private var accessStatusCard: some View {
        VStack(spacing: 12) {
            if isLoading && accessStatus == nil {
                ProgressView().tint(DojoTheme.piuAccent)
                    .padding(.vertical, 20)
            } else {
                HStack(spacing: 10) {
                    Image(systemName: accessStatus?.hasAccess == true ? "checkmark.shield.fill" : "shield.slash")
                        .font(.system(size: 24))
                        .foregroundColor(accessStatus?.hasAccess == true ? DojoTheme.piuGreen : DojoTheme.textMuted)

                    VStack(alignment: .leading, spacing: 2) {
                        Text("ACCESS STATUS")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(DojoTheme.textMuted)

                        Text(accessStatus?.hasAccess == true ? "Active" : "No Access")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundColor(accessStatus?.hasAccess == true ? DojoTheme.piuGreen : .white)
                    }

                    Spacer()

                    if let type = accessStatus?.accessType {
                        Text(type.replacingOccurrences(of: "_", with: " ").capitalized)
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(DojoTheme.piuAccent)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(DojoTheme.piuAccent.opacity(0.15))
                            .cornerRadius(6)
                    }
                }

                if let expires = accessStatus?.expiresAt {
                    HStack(spacing: 4) {
                        Image(systemName: "clock")
                            .font(.system(size: 11))
                        Text("Expires: \(formatDate(expires))")
                            .font(.system(size: 12))
                    }
                    .foregroundColor(DojoTheme.textMuted)
                }
            }

            if let err = errorMessage {
                Text(err).font(.system(size: 12)).foregroundColor(.red)
            }
            if let msg = successMessage {
                Text(msg).font(.system(size: 12)).foregroundColor(DojoTheme.piuGreen)
            }
        }
        .padding()
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
    }

    // MARK: - Active Membership

    @ViewBuilder
    private var activeMembershipCard: some View {
        if let membership = accessStatus?.membership {
            VStack(alignment: .leading, spacing: 10) {
                Text("ACTIVE MEMBERSHIP")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(DojoTheme.piuGold)

                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(membership.planName ?? "Membership")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(.white)

                        Text("Status: \(membership.status?.capitalized ?? "Active")")
                            .font(.system(size: 12))
                            .foregroundColor(DojoTheme.textMuted)
                    }

                    Spacer()

                    if membership.autoRenew == true {
                        HStack(spacing: 4) {
                            Image(systemName: "arrow.triangle.2.circlepath")
                                .font(.system(size: 10))
                            Text("Auto-renew")
                                .font(.system(size: 11))
                        }
                        .foregroundColor(DojoTheme.piuGreen)
                    }
                }

                HStack(spacing: 16) {
                    if let start = membership.startDate {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Started")
                                .font(.system(size: 10))
                                .foregroundColor(DojoTheme.textMuted)
                            Text(formatDate(start))
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(.white)
                        }
                    }
                    if let end = membership.endDate {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Ends")
                                .font(.system(size: 10))
                                .foregroundColor(DojoTheme.textMuted)
                            Text(formatDate(end))
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(.white)
                        }
                    }
                }
            }
            .padding()
            .background(DojoTheme.piuCard)
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(DojoTheme.piuGold.opacity(0.3), lineWidth: 1)
            )
        }
    }

    // MARK: - Plans

    private var plansSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("AVAILABLE PLANS")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(DojoTheme.piuAccent)

            if plans.isEmpty && !isLoading {
                Text("No plans available for this venue")
                    .font(.system(size: 13))
                    .foregroundColor(DojoTheme.textMuted)
                    .padding(.vertical, 16)
                    .frame(maxWidth: .infinity)
            }

            ForEach(plans) { plan in
                planCard(plan)
            }
        }
    }

    private func planCard(_ plan: VenuePlan) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(plan.name ?? "Plan")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.white)

                    Text(plan.planType?.replacingOccurrences(of: "_", with: " ").capitalized ?? "")
                        .font(.system(size: 11))
                        .foregroundColor(DojoTheme.textMuted)
                }

                Spacer()

                Text(plan.priceFormatted)
                    .font(.system(size: 20, weight: .bold))
                    .foregroundColor(DojoTheme.piuGold)
            }

            if let features = plan.features, !features.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(features, id: \.self) { feature in
                        HStack(spacing: 6) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 11))
                                .foregroundColor(DojoTheme.piuGreen)
                            Text(feature)
                                .font(.system(size: 12))
                                .foregroundColor(DojoTheme.textSecondary)
                        }
                    }
                }
            }

            if let cadences = plan.cadences, !cadences.isEmpty {
                ForEach(cadences) { cadence in
                    Button {
                        Task { await purchaseSubscription(planId: plan.id, cadenceKey: cadence.key ?? "") }
                    } label: {
                        HStack {
                            Text(cadence.label ?? cadence.key ?? "Subscribe")
                                .font(.system(size: 13, weight: .bold))
                            Spacer()
                            if let p = cadence.price {
                                Text(String(format: "$%.2f", Double(p) / 100.0))
                                    .font(.system(size: 13, weight: .bold))
                            }
                        }
                        .foregroundColor(.white)
                        .padding(.vertical, 10)
                        .padding(.horizontal, 16)
                        .background(DojoTheme.piuAccent)
                        .cornerRadius(8)
                    }
                    .disabled(isPurchasing)
                }
            } else if plan.planType == "day_pass" {
                Button {
                    Task { await purchaseDayPass() }
                } label: {
                    HStack {
                        if isPurchasing { ProgressView().tint(.white).scaleEffect(0.8) }
                        Text("Purchase Day Pass")
                            .font(.system(size: 14, weight: .bold))
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(DojoTheme.piuAccent)
                    .cornerRadius(8)
                }
                .disabled(isPurchasing)
            }
        }
        .padding()
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(DojoTheme.piuBorder, lineWidth: 1)
        )
    }

    // MARK: - Actions

    private func loadAll() async {
        isLoading = true
        async let a = APIService.shared.getMyVenueAccess(venueSlug)
        async let p = APIService.shared.getVenuePlans(venueSlug)
        accessStatus = try? await a
        plans = (try? await p) ?? []
        isLoading = false
    }

    private func purchaseDayPass() async {
        isPurchasing = true
        errorMessage = nil
        successMessage = nil
        let today = ISO8601DateFormatter().string(from: Date()).prefix(10)
        do {
            _ = try await APIService.shared.purchaseDayPass(venueSlug: venueSlug, date: String(today))
            successMessage = "Day pass purchased!"
            await loadAll()
        } catch {
            errorMessage = error.localizedDescription
        }
        isPurchasing = false
    }

    private func purchaseSubscription(planId: String, cadenceKey: String) async {
        isPurchasing = true
        errorMessage = nil
        successMessage = nil
        do {
            _ = try await APIService.shared.purchaseSubscription(venueSlug: venueSlug, planId: planId, cadenceKey: cadenceKey)
            successMessage = "Subscription activated!"
            await loadAll()
        } catch {
            errorMessage = error.localizedDescription
        }
        isPurchasing = false
    }

    private func formatDate(_ iso: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: iso) {
            let df = DateFormatter()
            df.dateStyle = .medium
            return df.string(from: date)
        }
        return String(iso.prefix(10))
    }
}
