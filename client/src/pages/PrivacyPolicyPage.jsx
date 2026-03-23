import React from 'react';

export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 sm:py-10">
      <div className="card space-y-8">
        <header className="space-y-3">
          <p className="text-xs font-display tracking-[0.35em] text-piu-accent/80">LEGAL</p>
          <div>
            <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-wider">Privacy Policy</h1>
            <p className="mt-2 text-sm text-gray-400">Effective date: March 11, 2026</p>
          </div>
          <p className="text-sm text-gray-300 leading-7">
            This Privacy Policy explains how Shinsa, also referred to as Pump Shinsa, accesses, uses, stores, and shares
            personal information and Google user data when you use the app, website, and related features.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-xl font-display font-bold">What We Collect</h2>
          <div className="space-y-3 text-sm leading-7 text-gray-300">
            <p>
              We collect information you provide directly, including your username, password, email address, profile
              avatar, biography, nationality, optional health and profile details, community posts, comments, uploaded
              images, tournament and duel activity, and messages or other content you choose to submit.
            </p>
            <p>
              If you choose to connect optional integrations, we also collect the information needed to provide those
              features. For PIUGame sync, this includes your PIUGame credentials, which Shinsa stores in encrypted form
              so it can import your pumbility, best scores, and recently played songs. For web push notifications, we
              store your browser push subscription details. For live features, we may store session, stream, and activity
              metadata you create in the app.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-display font-bold">Google User Data</h2>
          <div className="space-y-3 text-sm leading-7 text-gray-300">
            <p>
              If you connect your Google account for YouTube, Shinsa requests access to the YouTube scope configured by
              the app, currently the YouTube account access needed to read your own channel and live broadcast data.
              Shinsa uses Google user data only to let you connect the YouTube channel you stream from and to show your
              linked channel plus active or upcoming broadcasts inside Shinsa Live.
            </p>
            <p>
              When you connect YouTube, Shinsa stores your YouTube channel ID, channel title, channel thumbnail URL,
              encrypted Google access token, encrypted Google refresh token, token scope, token type, token expiry time,
              connection timestamps, and any connection error state needed to keep the link working.
            </p>
            <p>
              Shinsa does not use Google user data for advertising, does not sell Google user data, and does not use it
              to build generalized user profiles. Shinsa does not post, upload, edit, or delete YouTube content on your
              behalf through this integration. Shinsa follows Google API Services requirements, including Google&apos;s
              Limited Use rules, for Google user data received through Google APIs.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-display font-bold">How We Use Information</h2>
          <div className="space-y-3 text-sm leading-7 text-gray-300">
            <p>
              We use your information to operate the service, authenticate your account, personalize your profile,
              display public community features, run tournaments and duels, import optional score data, deliver
              notifications, support live and community features, improve reliability, and respond to support or safety
              issues.
            </p>
            <p>
              We may also use service logs, device, browser, and request information to secure the app, prevent abuse,
              debug problems, and monitor performance.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-display font-bold">How Information Is Shared</h2>
          <div className="space-y-3 text-sm leading-7 text-gray-300">
            <p>
              Content you choose to make visible in Shinsa, such as your profile, posts, comments, tournament results,
              duel activity, communities, and linked stream information, may be shown to other users according to the
              feature design.
            </p>
            <p>
              We may share information with service providers and platform partners only as needed to run the service,
              such as hosting providers, browser push services, Google for the YouTube connection you initiate, and
              PIUGame when you request a score sync. We may also disclose information if required by law or to protect
              users, the service, or our rights.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-display font-bold">Storage and Retention</h2>
          <div className="space-y-3 text-sm leading-7 text-gray-300">
            <p>
              Shinsa stores data in its application database and related storage systems. Sensitive integration
              credentials, including PIUGame credentials and Google OAuth tokens, are stored in encrypted form on the
              server. We keep information for as long as it is needed to operate the service, comply with legal
              obligations, resolve disputes, and enforce our terms.
            </p>
            <p>
              You can disconnect your YouTube account from the account settings page. Disconnecting removes the stored
              YouTube connection record from Shinsa. You can also remove PIUGame credentials from your account settings.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-display font-bold">Your Choices</h2>
          <div className="space-y-3 text-sm leading-7 text-gray-300">
            <p>
              You can edit profile information inside the app, choose what content you post, manage notification
              settings, disconnect optional integrations, and stop using the service at any time.
            </p>
            <p>
              If you want to ask about access, correction, or deletion of your personal information, contact us at{' '}
              <a className="text-piu-accent hover:underline" href="mailto:support@pumpshinsa.com">support@pumpshinsa.com</a>.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-display font-bold">Changes to This Policy</h2>
          <p className="text-sm leading-7 text-gray-300">
            We may update this Privacy Policy from time to time. When we make material changes, we will update the
            effective date on this page and, where appropriate, update related in-product notices so they remain
            consistent with how Shinsa uses personal information and Google user data.
          </p>
        </section>
      </div>
    </div>
  );
}
