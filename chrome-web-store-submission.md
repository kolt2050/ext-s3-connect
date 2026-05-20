# Chrome Web Store Submission Notes

Use this document as copy-ready text for the Chrome Web Store Developer Dashboard.

## Extension Package

Upload the production ZIP generated from the `dist/` folder:

```text
s3-obs-connect.zip
```

## Privacy Policy URL

After publishing the `docs/` folder with GitHub Pages or another static host, use:

```text
https://kolt2050.github.io/ext-s3-connect/privacy-policy.html
```

## Short Description

```text
Open S3-compatible OBS buckets in a Chrome tab to browse, upload, preview, download, and delete objects.
```

## Detailed Description

```text
S3/OBS Connect is a Chrome extension for working with S3-compatible object storage directly from a browser tab.

The extension lets users save bucket connections, open OBS/S3 paths, browse folders and objects, search within the current prefix, upload files by picker or drag and drop, create folders, preview common text, image, audio, and video files, download objects, delete selected objects, reorder connection tabs, view local activity logs, and switch between light and dark themes.

The app is designed for S3-compatible endpoints such as OBS services. Users provide their own access key, secret key, bucket path, and server address. Requests are sent from the browser only to the user-configured storage endpoint using the bundled AWS SDK client. No project-owned backend, account system, advertising, analytics, payment processing, AI/LLM API, or remote code loading is used.

The extension uses virtual-hosted-style S3 access for bucket requests.
```

## Single Purpose Statement

```text
The extension has one purpose: help users manage files in user-configured S3-compatible OBS buckets from a Chrome extension tab.
```

## Permission Justifications

### `storage`

```text
Required to save user-created bucket connection profiles, credentials entered by the user, connection order, current folder state, local logs, and theme preference in Chrome extension storage.
```

### `tabs`

```text
Required to open the extension's full-page bucket manager in a browser tab and focus an existing S3/OBS Connect tab when the toolbar icon is clicked.
```

### Host permissions: `https://*/*`

```text
Required because users can connect to different self-managed or provider-managed S3-compatible HTTPS endpoints, and those endpoint hostnames are not known before the user enters a Server Address. The extension sends storage API requests only to the server address entered by the user.
```

## Data Usage Disclosure

The extension stores the following data locally in Chrome extension storage:

- access key IDs and secret access keys entered by the user;
- OBS/S3 access paths, bucket names, prefixes, server addresses, and inferred regions;
- connection tab order and current navigation state;
- object listing state, selected object keys, local activity logs, and theme preference.

Suggested disclosure:

```text
The extension stores user-entered connection details and local app state in Chrome extension storage so the user can reopen and manage configured buckets. This data is used only to connect to user-specified S3-compatible endpoints and provide bucket management features. The extension does not sell data, use data for advertising, or transfer data to a project-owned backend.
```

## Third-Party Requests Disclosure

```text
The extension sends network requests only to S3-compatible storage endpoints configured by the user. No analytics, advertising, tracking, payment, AI, or project-owned backend requests are made.
```

## Remote Code Disclosure

```text
No remote code is loaded or executed. All JavaScript, UI code, and bundled libraries are included in the extension package.
```

## Privacy Practices Summary

```text
S3/OBS Connect stores connection details locally and uses them only to communicate with user-configured S3-compatible endpoints. It does not collect data for tracking or advertising and does not operate a backend service.
```

## Chrome Web Store Privacy Tab Notes

Suggested user data handling answers:

- Data is not sold to third parties.
- Data is not used or transferred for purposes unrelated to the extension's single purpose.
- Data is not used or transferred to determine creditworthiness or for lending purposes.
- User-entered credentials and bucket connection details are stored locally in Chrome extension storage.
- Network communication is limited to S3-compatible HTTPS endpoints configured by the user.
- No project-owned backend, analytics, advertising, tracking, payment, AI, or LLM service is used.

## Security Note

```text
Users should enter credentials only for buckets they are authorized to access. Credentials are stored locally in Chrome extension storage on the user's device.
```
