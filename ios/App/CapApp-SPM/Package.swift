// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.5.1"),
        .package(name: "CapacitorFirebaseFirestore", path: "../../../node_modules/@capacitor-firebase/firestore"),
        .package(name: "CapacitorFirebaseFunctions", path: "../../../node_modules/@capacitor-firebase/functions"),
        .package(name: "CapacitorFirebaseMessaging", path: "../../../node_modules/@capacitor-firebase/messaging"),
        .package(name: "CapacitorApp", path: "../../../node_modules/@capacitor/app"),
        .package(name: "CapacitorClipboard", path: "../../../node_modules/@capacitor/clipboard"),
        .package(name: "CapacitorGeolocation", path: "../../../node_modules/@capacitor/geolocation"),
        .package(name: "CapacitorLocalNotifications", path: "../../../node_modules/@capacitor/local-notifications"),
        .package(name: "CapawesomeCapacitorAppReview", path: "../../../node_modules/@capawesome/capacitor-app-review"),
        .package(name: "CapawesomeCapacitorAppleSignIn", path: "../../../node_modules/@capawesome/capacitor-apple-sign-in"),
        .package(name: "CapawesomeCapacitorGoogleSignIn", path: "../../../node_modules/@capawesome/capacitor-google-sign-in"),
        .package(name: "RevenuecatPurchasesCapacitor", path: "../../../node_modules/@revenuecat/purchases-capacitor")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorFirebaseFirestore", package: "CapacitorFirebaseFirestore"),
                .product(name: "CapacitorFirebaseFunctions", package: "CapacitorFirebaseFunctions"),
                .product(name: "CapacitorFirebaseMessaging", package: "CapacitorFirebaseMessaging"),
                .product(name: "CapacitorApp", package: "CapacitorApp"),
                .product(name: "CapacitorClipboard", package: "CapacitorClipboard"),
                .product(name: "CapacitorGeolocation", package: "CapacitorGeolocation"),
                .product(name: "CapacitorLocalNotifications", package: "CapacitorLocalNotifications"),
                .product(name: "CapawesomeCapacitorAppReview", package: "CapawesomeCapacitorAppReview"),
                .product(name: "CapawesomeCapacitorAppleSignIn", package: "CapawesomeCapacitorAppleSignIn"),
                .product(name: "CapawesomeCapacitorGoogleSignIn", package: "CapawesomeCapacitorGoogleSignIn"),
                .product(name: "RevenuecatPurchasesCapacitor", package: "RevenuecatPurchasesCapacitor")
            ]
        )
    ]
)
