import path from "node:path";
import type { Configuration } from "electron-builder";
import { exec } from "node:child_process";

const appId = "com.rick-bowman.multimind";
const productName = "MultiMind";
const executableName = "multimind";
const appxIdentityName = "com.rick-bowman.multimind";

async function codesignApp(appPath) {
    console.log('Executing codesign command for:', appPath);
    return new Promise((resolve, reject) => {
        const command = `codesign --force --deep --sign - ${appPath}`;
        console.log('Running command:', command);

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error('Codesign error:', error);
                console.error('Stderr:', stderr);
                reject(new Error(`Codesign failed: ${stderr || error.message}`));
                return;
            }
            console.log('Codesign stdout:', stdout);
            resolve(stdout);
        });
    });
}

/**
 * @see - https://www.electron.build/configuration/configuration
 */
export default {
    appId: appId,
    asar: true,
    productName: productName,
    executableName: executableName,
    directories: {
        output: "release",
        buildResources: "assets"        
    },
    icon: "dist/icon.png",

    // remove this once you set up your own code signing for macOS
    async afterPack(context) {
        if (context.electronPlatformName === "darwin") {
            console.log('Starting macOS afterPack process...');
            console.log('Platform:', context.electronPlatformName);
            console.log('App output directory:', context.appOutDir);
            
            // check whether the app was already signed
            const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
            console.log('App path:', appPath);

            // this is needed for the app to not appear as "damaged" on Apple Silicon Macs
            // https://github.com/electron-userland/electron-builder/issues/5850#issuecomment-1821648559
            console.log('Starting code signing process...');
            try {
                await codesignApp(appPath);
                console.log('Code signing completed successfully');
            } catch (error) {
                console.error('Code signing failed:', error);
                throw error;
            }
        } else {
            console.log('Skipping macOS afterPack process - not building for macOS');
        }
    },
    files: [
        "dist",
        "!node_modules/node-llama-cpp/bins/**/*",
        "node_modules/node-llama-cpp/bins/${os}-${arch}*/**/*",
        "!node_modules/node-llama-cpp/llama/localBuilds/**/*",
        "node_modules/node-llama-cpp/llama/localBuilds/${os}-${arch}*/**/*",
        "!node_modules/@node-llama-cpp/*/bins/**/*",
        "node_modules/@node-llama-cpp/${os}-${arch}*/bins/**/*"
    ],
    publish: {
      "provider": "github",
      "owner": "richardbowman",
      "repo": "multimind-agent-platform",
      "releaseType": "release",
      "private": false
    },
    extraFiles: [
      "docs/LICENSE.md"
    ],
    extraResources: [
      {
        "from": "docs/LICENSE.md",
        "to": "LICENSE.md"
      }
    ],
    asarUnpack: [
        "node_modules/node-llama-cpp/bins",
        "node_modules/node-llama-cpp/llama/localBuilds",
        "node_modules/@node-llama-cpp/*"
    ],
    mac: {
        target: [{
            target: "dmg",
            arch: [
                "arm64",
                "x64"
            ]
        }, {
            target: "zip",
            arch: [
                "arm64",
                "x64"
            ]
        }],

        artifactName: "${name}.macOS.${version}.${arch}.${ext}"
    },
    win: {
        target: [{
            target: "nsis",
            arch: [
                "x64",
                "arm64"
            ]
        }],

        artifactName: "${name}.Windows.${version}.${ext}"
    },
    appx: {
        identityName: appxIdentityName,
        artifactName: "${name}.Windows.${version}.${ext}"
    },
    nsis: {
        oneClick: true,
        perMachine: false,
        allowToChangeInstallationDirectory: false,
        deleteAppDataOnUninstall: true
    },
    linux: {
        target: [{
            target: "AppImage",
            arch: [
                "x64",
                "arm64"
            ]
        }, {
            target: "snap",
            arch: [
                "x64"
            ]
        }, {
            target: "deb",
            arch: [
                "x64",
                "arm64"
            ]
        }, {
            target: "tar.gz",
            arch: [
                "x64",
                "arm64"
            ]
        }],
        category: "Utility",

        artifactName: "${name}.Linux.${version}.${arch}.${ext}"
    }
} as Configuration;
