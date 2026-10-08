# Display Test App

## Prerequisites

* An installed copy of Android Studio (version 4 or later).
* An Android tablet running at least API 28 (Android 9).

## Building and Running

First, `rush install` and `rush rebuild` (at least up to **display-test-app**).

Next, within **display-test-app**, `npm run build:android`.

Create a local.properties file in `android/ivaultjs-test-app` that contains the following:
```
sdk.dir=/Users/<your_user_name_here>/Library/Android/sdk
gpr.user=<your_github_id_here>
gpr.key=<your_github_PAT_with_packages_scope_here>
```
The PAT (personal access token) is necessary as GitHub Packages requires authenticated access. For more information see their [Gradle registry page](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-gradle-registry).

To run the app, open the **ivaultjs-test-app** project (a directory peer of this README file) in Android Studio and select `Run 'app'` or `Debug 'app'` from the **Run** menu.

## Displaying an iVault

Press the briefcase button and you will be able to select a snapshot iVault to open. It will get copied into the app's external files directory and then opened from there.

## Using a local build of the add-on (szewTwinAndroidLibrary.aar)

If you have a local build of the add-on that you need to debug, you can publish it to the local Maven repo which will then get used by the display-test-app build.

For example, here are the steps for publishing version 3.5.2 locally on a Mac. Do this in a directory outside the ivaultjs-core tree.

```shell
git clone https://github.com/szewTwin/mobile-native-android.git
cd mobile-native-android
git checkout 3.5.2
cp $(OutRoot)AndroidX64/BuildContexts/iVaultJsMobile/Delivery/AndroidPackages/szewTwinAndroidLibrary.aar .
./gradlew --no-daemon publishToMavenLocal
```
You should then be able to build/sync in Android Studio and your add-on build will be used.

The last step creates files in `~/.m2/repository/com/github/szewtwin/mobile-native-android`. You should remove these once you're done.