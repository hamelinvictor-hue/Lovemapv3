const fs = require('fs');
const path = require('path');

const targetPath = path.join(
  __dirname,
  '..',
  'node_modules',
  '@capacitor-community',
  'apple-sign-in',
  'ios',
  'Sources',
  'SignInWithApple',
  'Plugin.swift'
);

const patchedSwift = `import Foundation
import Capacitor
import AuthenticationServices

@objc(SignInWithApple)
public class SignInWithApple: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SignInWithApple" 
    public let jsName = "SignInWithApple" 
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise),
    ] 

    private var currentAuthorizationController: ASAuthorizationController?

    @objc func authorize(_ call: CAPPluginCall) {
        let appleIDProvider = ASAuthorizationAppleIDProvider()
        let request = appleIDProvider.createRequest()
        request.requestedScopes = getRequestedScopes(from: call)
        request.state = call.getString("state")
        request.nonce = call.getString("nonce")

        let defaults = UserDefaults.standard
        defaults.setValue(call.callbackId, forKey: "callbackId")

        self.bridge?.saveCall(call)

        DispatchQueue.main.async {
            let controller = ASAuthorizationController(authorizationRequests: [request])
            self.currentAuthorizationController = controller
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    func getRequestedScopes(from call: CAPPluginCall) -> [ASAuthorization.Scope]? {
        var requestedScopes: [ASAuthorization.Scope] = []

        if let scopesStr = call.getString("scopes") {
            if scopesStr.contains("name") {
                requestedScopes.append(.fullName)
            }

            if scopesStr.contains("email") {
                requestedScopes.append(.email)
            }
        }

        if requestedScopes.count > 0 {
            return requestedScopes
        }

        return nil
    }
}

extension SignInWithApple: ASAuthorizationControllerPresentationContextProviding {
    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        if let window = self.bridge?.webView?.window {
            return window
        }
        if let keyWindow = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .flatMap({ $0.windows })
            .first(where: { $0.isKeyWindow }) {
            return keyWindow
        }
        return UIWindow()
    }
}

extension SignInWithApple: ASAuthorizationControllerDelegate {
    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        let defaults = UserDefaults.standard
        let id = defaults.string(forKey: "callbackId") ?? ""
        guard let call = self.bridge?.savedCall(withID: id) else {
            self.currentAuthorizationController = nil
            return
        }

        guard let appleIDCredential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            call.reject("Type d'identifiant Apple non supporté.")
            self.bridge?.releaseCall(call)
            self.currentAuthorizationController = nil
            return
        }

        var identityTokenString: String? = nil
        if let tokenData = appleIDCredential.identityToken {
            identityTokenString = String(data: tokenData, encoding: .utf8)
        }

        var authorizationCodeString: String? = nil
        if let codeData = appleIDCredential.authorizationCode {
            authorizationCodeString = String(data: codeData, encoding: .utf8)
        }

        let result: [String: Any] = [
            "response": [
                "user": appleIDCredential.user,
                "email": appleIDCredential.email as Any,
                "givenName": appleIDCredential.fullName?.givenName as Any,
                "familyName": appleIDCredential.fullName?.familyName as Any,
                "identityToken": identityTokenString as Any,
                "authorizationCode": authorizationCodeString as Any
            ]
        ]

        call.resolve(result)
        self.bridge?.releaseCall(call)
        self.currentAuthorizationController = nil
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        let defaults = UserDefaults.standard
        let id = defaults.string(forKey: "callbackId") ?? ""
        guard let call = self.bridge?.savedCall(withID: id) else {
            self.currentAuthorizationController = nil
            return
        }
        call.reject(error.localizedDescription)
        self.bridge?.releaseCall(call)
        self.currentAuthorizationController = nil
    }
}
`;

try {
  if (fs.existsSync(targetPath)) {
    fs.writeFileSync(targetPath, patchedSwift, 'utf8');
    console.log('[Patch] Plugin.swift pour Apple Sign-In patché avec succès.');
  } else {
    console.log('[Patch] Plugin.swift introuvable, étape ignorée.');
  }
} catch (e) {
  console.warn('[Patch] Avertissement lors du patch de Plugin.swift:', e);
}
