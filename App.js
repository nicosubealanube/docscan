import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TouchableOpacity, Alert, ActivityIndicator, SafeAreaView, Image, Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system';
import { MaterialIcons } from '@expo/vector-icons';

const { StorageAccessFramework } = FileSystem;

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const [processing, setProcessing] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null); // Stores the captured photo
  const [rotation, setRotation] = useState(0); // 0, 90, 180, 270

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Image source={require('./assets/logo_minimal.png')} style={styles.permissionLogo} resizeMode="contain" />
        <Text style={styles.message}>Necesitamos acceso a tu cámara para escanear documentos.</Text>
        <TouchableOpacity onPress={requestPermission} style={styles.permissionButton}>
          <Text style={styles.permissionButtonText}>Permitir Acceso</Text>
        </TouchableOpacity>
        <StatusBar style="dark" />
      </View>
    );
  }

  const takePicture = async () => {
    if (cameraRef.current && !processing) {
      setProcessing(true);
      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.8,
          base64: true,
          skipProcessing: true,
        });
        setCapturedImage(photo);
        setRotation(0); // Reset rotation for new image
        setIsCameraOpen(false); // Close camera view to show preview
      } catch (error) {
        console.error(error);
        Alert.alert("Error", "No se pudo capturar la imagen.");
      } finally {
        setProcessing(false);
      }
    }
  };

  const rotateImage = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const discardImage = () => {
    setCapturedImage(null);
    setRotation(0);
    setIsCameraOpen(true); // Return to camera
  };

  const savePdf = async () => {
    if (!capturedImage) return;
    setProcessing(true);

    try {
      // Create HTML with rotation applied via CSS
      const html = `
        <html>
          <body style="margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; height: 100vh; background-color: white;">
            <img 
              src="data:image/jpeg;base64,${capturedImage.base64}" 
              style="
                max-width: 100vw; 
                max-height: 100vh;
                transform: rotate(${rotation}deg);
                transform-origin: center;
              " 
            />
          </body>
        </html>
      `;

      if (Platform.OS === 'web') {
        await Print.printAsync({ html });
        setCapturedImage(null); // Reset after save
        return;
      }

      // Android/iOS Logic
      const { uri: tempPdfUri } = await Print.printToFileAsync({ html });

      if (StorageAccessFramework) {
        const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();

        if (permissions.granted) {
          const directoryUri = permissions.directoryUri;
          let filename = "imagen.pdf";

          // Simple filename logic (optional: could be improved)
          try {
            const files = await StorageAccessFramework.readDirectoryAsync(directoryUri);
            const regex = /^imagen(\d*)\.pdf$/;
            let maxIndex = 0;
            let foundBase = false;

            files.forEach(fileUri => {
              const decodedUri = decodeURIComponent(fileUri);
              const name = decodedUri.split('/').pop();
              const match = name.match(regex);
              if (match) {
                if (match[1] === '') foundBase = true;
                else {
                  const index = parseInt(match[1], 10);
                  if (index > maxIndex) maxIndex = index;
                }
              }
            });

            if (foundBase && maxIndex === 0) filename = "imagen2.pdf";
            else if (maxIndex > 0) filename = `imagen${maxIndex + 1}.pdf`;

            const pdfContent = await FileSystem.readAsStringAsync(tempPdfUri, { encoding: FileSystem.EncodingType.Base64 });
            const newFileUri = await StorageAccessFramework.createFileAsync(directoryUri, filename, 'application/pdf');
            await FileSystem.writeAsStringAsync(newFileUri, pdfContent, { encoding: FileSystem.EncodingType.Base64 });

            Alert.alert("Guardado", `Documento guardado: ${filename}`, [
              { text: "OK", onPress: () => { setCapturedImage(null); setIsCameraOpen(false); } }
            ]);

          } catch (e) {
            console.error(e);
            Alert.alert("Error", "No se pudo guardar: " + e.message);
          }
        } else {
          // User cancelled permission
          setProcessing(false);
        }
      } else {
        Alert.alert("Aviso", "Almacenamiento no disponible (Modo Testing)", [
          { text: "OK", onPress: () => { setCapturedImage(null); } }
        ]);
      }

    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Error al generar el PDF.");
    } finally {
      setProcessing(false);
    }
  };

  // ---------------- VIEW LOGIC ----------------

  // 1. Preview & Edit Screen
  if (capturedImage) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.previewContainer}>
          {/* Image Preview with Rotation */}
          <View style={styles.imageWrapper}>
            <Image
              source={{ uri: capturedImage.uri }}
              style={[
                styles.previewImage,
                { transform: [{ rotate: `${rotation}deg` }] }
              ]}
              resizeMode="contain"
            />
          </View>

          {/* Edit Controls */}
          <View style={styles.editControls}>
            <TouchableOpacity onPress={rotateImage} style={styles.controlButton}>
              <MaterialIcons name="rotate-right" size={30} color="#3498db" />
              <Text style={styles.controlLabel}>Rotar</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={discardImage} style={styles.controlButton}>
              <MaterialIcons name="delete" size={30} color="#e74c3c" />
              <Text style={[styles.controlLabel, { color: '#e74c3c' }]}>Descartar</Text>
            </TouchableOpacity>
          </View>

          {/* Main Save Button */}
          <View style={styles.saveContainer}>
            {processing ? (
              <ActivityIndicator size="large" color="#3498db" />
            ) : (
              <TouchableOpacity onPress={savePdf} style={styles.primaryButton}>
                <MaterialIcons name="save" size={24} color="#fff" />
                <Text style={styles.primaryButtonText}>Guardar como PDF</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        <StatusBar style="dark" />
      </SafeAreaView>
    );
  }

  // 2. Camera View
  if (isCameraOpen) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView style={styles.camera} ref={cameraRef} facing="back">
          <SafeAreaView style={styles.uiContainer}>
            <View style={styles.cameraHeader}>
              <TouchableOpacity onPress={() => setIsCameraOpen(false)} style={styles.backButton}>
                <MaterialIcons name="close" size={30} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.viewfinderContainer}>
              <View style={styles.viewfinderCornerTopLeft} />
              <View style={styles.viewfinderCornerTopRight} />
              <View style={styles.viewfinderCornerBottomLeft} />
              <View style={styles.viewfinderCornerBottomRight} />
            </View>

            <View style={styles.controls}>
              {processing ? (
                <ActivityIndicator size="large" color="#fff" />
              ) : (
                <TouchableOpacity style={styles.shutterButton} onPress={takePicture}>
                  <View style={styles.shutterButtonInner} />
                </TouchableOpacity>
              )}
            </View>
            <View style={{ height: 20 }} />
          </SafeAreaView>
        </CameraView>
        <StatusBar style="light" />
      </View>
    );
  }

  // 3. Home Screen
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.homeContainer}>
        <View style={styles.header}>
          <Image source={require('./assets/logo_minimal.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>DOCSCAN</Text>
          <Text style={styles.subtitle}>scan ur document and make it pdf free</Text>
        </View>

        <View style={styles.centerContent}>
          <TouchableOpacity onPress={() => setIsCameraOpen(true)} style={styles.primaryButton}>
            <MaterialIcons name="document-scanner" size={40} color="#fff" />
            <Text style={styles.primaryButtonText}>Nuevo Escaneo</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.disclaimer}>
            Tus documentos se procesan localmente y nunca salen de tu dispositivo.
          </Text>
          <Text style={styles.branding}>
            App desarrollada por nicosubealanube ®
          </Text>
        </View>
      </View>
      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  // ... (Keep existing shared styles)
  homeContainer: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'space-between',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingTop: 60,
    alignItems: 'center',
  },
  logo: {
    width: 150,
    height: 150,
    marginBottom: 20,
    borderRadius: 20,
  },
  title: {
    fontSize: 42,
    fontWeight: 'bold',
    color: '#2c3e50',
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 16,
    color: '#7f8c8d',
    marginTop: 5,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 22,
  },
  // Buttons
  primaryButton: {
    flexDirection: 'row',
    backgroundColor: '#3498db',
    paddingVertical: 18,
    paddingHorizontal: 30,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 5,
  },
  primaryButtonText: {
    color: '#fff',
    marginLeft: 10,
    fontSize: 18,
    fontWeight: '600',
  },
  permissionButton: {
    backgroundColor: '#3498db',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  permissionLogo: {
    width: 80,
    height: 80,
    marginBottom: 20,
  },
  message: {
    textAlign: 'center',
    paddingHorizontal: 40,
    paddingBottom: 20,
    color: '#7f8c8d',
    fontSize: 16,
    lineHeight: 24,
  },

  // Preview Screen Styles
  previewContainer: {
    flex: 1,
    justifyContent: 'space-between',
    paddingBottom: 20,
  },
  imageWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f6fa',
    margin: 20,
    borderRadius: 15,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  editControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 40,
    marginBottom: 30,
  },
  controlButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlLabel: {
    marginTop: 5,
    fontSize: 12,
    color: '#3498db',
    fontWeight: '600',
  },
  saveContainer: {
    paddingHorizontal: 40,
    height: 60,
    justifyContent: 'center',
  },

  // Camera Styles
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  uiContainer: {
    flex: 1,
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
  },
  cameraHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 40,
  },
  backButton: {
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 25,
  },
  viewfinderContainer: {
    flex: 1,
    margin: 40,
    justifyContent: 'center',
  },
  viewfinderCornerTopLeft: {
    position: 'absolute',
    top: 0, left: 0,
    width: 40, height: 40,
    borderTopWidth: 4, borderLeftWidth: 4,
    borderColor: 'white',
    borderTopLeftRadius: 10,
  },
  viewfinderCornerTopRight: {
    position: 'absolute',
    top: 0, right: 0,
    width: 40, height: 40,
    borderTopWidth: 4, borderRightWidth: 4,
    borderColor: 'white',
    borderTopRightRadius: 10,
  },
  viewfinderCornerBottomLeft: {
    position: 'absolute',
    bottom: 0, left: 0,
    width: 40, height: 40,
    borderBottomWidth: 4, borderLeftWidth: 4,
    borderColor: 'white',
    borderBottomLeftRadius: 10,
  },
  viewfinderCornerBottomRight: {
    position: 'absolute',
    bottom: 0, right: 0,
    width: 40, height: 40,
    borderBottomWidth: 4, borderRightWidth: 4,
    borderColor: 'white',
    borderBottomRightRadius: 10,
  },
  controls: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  shutterButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: '#333',
    backgroundColor: 'white',
  },
  footer: {
    padding: 20,
    alignItems: 'center',
    paddingBottom: 20,
  },
  disclaimer: {
    color: '#95a5a6',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 5,
  },
  branding: {
    color: '#bdc3c7',
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '500',
  },
});
