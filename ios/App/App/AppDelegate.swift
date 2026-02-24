import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    private func currentRootViewController() -> UIViewController? {
        if let root = window?.rootViewController {
            return root
        }
        for scene in UIApplication.shared.connectedScenes {
            guard let windowScene = scene as? UIWindowScene else { continue }
            if let keyRoot = windowScene.windows.first(where: { $0.isKeyWindow })?.rootViewController {
                return keyRoot
            }
            if let firstRoot = windowScene.windows.first?.rootViewController {
                return firstRoot
            }
        }
        return nil
    }

    private func findBridgeViewController(from controller: UIViewController?) -> CAPBridgeViewController? {
        guard let controller = controller else { return nil }
        if let bridge = controller as? CAPBridgeViewController {
            return bridge
        }
        if let navigation = controller as? UINavigationController {
            for child in navigation.viewControllers {
                if let bridge = findBridgeViewController(from: child) {
                    return bridge
                }
            }
        }
        if let tab = controller as? UITabBarController {
            for child in tab.viewControllers ?? [] {
                if let bridge = findBridgeViewController(from: child) {
                    return bridge
                }
            }
        }
        if let presented = controller.presentedViewController,
           let bridge = findBridgeViewController(from: presented) {
            return bridge
        }
        for child in controller.children {
            if let bridge = findBridgeViewController(from: child) {
                return bridge
            }
        }
        return nil
    }

    private func configureWebViewScrolling() {
        let root = currentRootViewController()
        guard let bridgeVC = findBridgeViewController(from: root) else { return }
        guard let scrollView = bridgeVC.webView?.scrollView else { return }
        scrollView.isScrollEnabled = true
        scrollView.bounces = true
        scrollView.alwaysBounceVertical = true
        scrollView.alwaysBounceHorizontal = false
        scrollView.contentInsetAdjustmentBehavior = .never
    }

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        DispatchQueue.main.async { [weak self] in
            self?.configureWebViewScrolling()
        }
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
        configureWebViewScrolling()
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
