
import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Image, StyleSheet, Dimensions, TouchableOpacity, PanResponder, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;

export default function ImageCropper({ imageUri, onCancel, onCrop }) {
    const [imageSize, setImageSize] = useState(null);
    const [viewSize, setViewSize] = useState(null);

    // Crop Box State (in view coordinates)
    const [cropBox, setCropBox] = useState({ x: 0, y: 0, width: 200, height: 200 });
    const minDimension = 50;

    useEffect(() => {
        Image.getSize(imageUri, (width, height) => {
            setImageSize({ width, height });
        }, (err) => console.error(err));
    }, [imageUri]);

    // Pan Responder for MOVING the box
    const panResponderMove = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: () => { },
            onPanResponderMove: (evt, gestureState) => {
                setCropBox(prev => ({
                    ...prev,
                    x: prev.x + gestureState.dx,
                    y: prev.y + gestureState.dy
                }));
            },
            onPanResponderRelease: () => {
                // Re-adjustment to bounds could be added here, but for simplicity we rely on visual
                // We should really prevent dragging out of bounds though.
                // A simple fix is to do the check in setCropBox in the next render cycle or use a specific setter
            }
        })
    ).current;

    // Simple handle for resizing (Bottom Right)
    const panResponderResize = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderMove: (evt, gestureState) => {
                setCropBox(prev => {
                    let newW = prev.width + gestureState.dx;
                    let newH = prev.height + gestureState.dy;
                    if (newW < minDimension) newW = minDimension;
                    if (newH < minDimension) newH = minDimension;
                    return {
                        ...prev,
                        width: newW,
                        height: newH
                    };
                });
            },
        })
    ).current;

    // Since PanResponder is additive on gestureState, we usually need to track accumulation or reset.
    // The above naive implementation will "jump" or accelerate if not handled carefully because gestureState.dx is accumulated 
    // from the start of the gesture. 
    // Correct approach: Use a ref to store the 'start' value.

    const cropBoxRef = useRef(cropBox);
    // Keep ref in sync
    useEffect(() => { cropBoxRef.current = cropBox; }, [cropBox]);

    const panResponderMoveCorrect = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onPanResponderGrant: () => {
                cropBoxRef.current = { ...cropBoxRef.current, startX: cropBoxRef.current.x, startY: cropBoxRef.current.y };
            },
            onPanResponderMove: (evt, gestureState) => {
                const start = cropBoxRef.current;
                setCropBox(prev => ({
                    ...prev,
                    x: start.startX + gestureState.dx,
                    y: start.startY + gestureState.dy
                }));
            }
        })
    ).current;

    const panResponderResizeCorrect = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onPanResponderGrant: () => {
                cropBoxRef.current = { ...cropBoxRef.current, startW: cropBoxRef.current.width, startH: cropBoxRef.current.height };
            },
            onPanResponderMove: (evt, gestureState) => {
                const start = cropBoxRef.current;
                let newW = start.startW + gestureState.dx;
                let newH = start.startH + gestureState.dy;
                if (newW < minDimension) newW = minDimension;
                if (newH < minDimension) newH = minDimension;

                setCropBox(prev => ({
                    ...prev,
                    width: newW,
                    height: newH
                }));
            }
        })
    ).current;


    const handleLayout = (event) => {
        const { width, height } = event.nativeEvent.layout;
        setViewSize({ width, height });
        // Initialize crop box to centered 80%
        setCropBox({
            x: width * 0.1,
            y: height * 0.1,
            width: width * 0.8,
            height: height * 0.8
        });
    };

    const calculateCrop = () => {
        if (!imageSize || !viewSize) return;

        // Calculate 'contain' image rect
        const imageRatio = imageSize.width / imageSize.height;
        const viewRatio = viewSize.width / viewSize.height;

        let renderWidth, renderHeight, renderX, renderY;

        if (imageRatio > viewRatio) {
            // Width constrained
            renderWidth = viewSize.width;
            renderHeight = viewSize.width / imageRatio;
            renderX = 0;
            renderY = (viewSize.height - renderHeight) / 2;
        } else {
            // Height constrained
            renderHeight = viewSize.height;
            renderWidth = viewSize.height * imageRatio;
            renderY = 0;
            renderX = (viewSize.width - renderWidth) / 2;
        }

        // Map cropbox to image coordinates
        // CropBox is in view coordinates
        // We need intersection of CropBox and RenderedImage

        // Relative to Rendered Image TopLeft
        const relativeX = cropBox.x - renderX;
        const relativeY = cropBox.y - renderY;

        const scale = imageSize.width / renderWidth; // or height/renderHeight (should be same)

        const finalCrop = {
            originX: Math.max(0, relativeX * scale),
            originY: Math.max(0, relativeY * scale),
            width: Math.min(imageSize.width, cropBox.width * scale),
            height: Math.min(imageSize.height, cropBox.height * scale)
        };

        // Boundary checks in case cropbox is outside
        if (finalCrop.originX + finalCrop.width > imageSize.width) {
            finalCrop.width = imageSize.width - finalCrop.originX;
        }
        if (finalCrop.originY + finalCrop.height > imageSize.height) {
            finalCrop.height = imageSize.height - finalCrop.originY;
        }

        onCrop(finalCrop);
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={onCancel} style={styles.headerBtn}>
                    <Text style={styles.headerText}>Cancelar</Text>
                </TouchableOpacity>
                <Text style={styles.title}>Recortar</Text>
                <TouchableOpacity onPress={calculateCrop} style={styles.headerBtn}>
                    <Text style={[styles.headerText, { fontWeight: 'bold' }]}>Listo</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.workspace} onLayout={handleLayout}>
                {imageSize && (
                    <Image
                        source={{ uri: imageUri }}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="contain"
                    />
                )}

                {/* Crop Box */}
                <View
                    style={[
                        styles.cropBox,
                        { left: cropBox.x, top: cropBox.y, width: cropBox.width, height: cropBox.height }
                    ]}
                    {...panResponderMoveCorrect.panHandlers}
                >
                    {/* Grid/Borders */}
                    <View style={styles.gridLineVertical} />
                    <View style={styles.gridLineHorizontal} />

                    {/* Resize Handle (Bottom Right) */}
                    <View
                        style={styles.cornerHandle}
                        {...panResponderResizeCorrect.panHandlers}
                    >
                        <MaterialIcons name="crop-free" size={24} color="white" />
                    </View>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    header: {
        height: 60,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        marginTop: 40,
    },
    headerBtn: {
        padding: 10,
    },
    headerText: {
        color: 'white',
        fontSize: 16,
    },
    title: {
        color: 'white',
        fontSize: 18,
        fontWeight: '600',
    },
    workspace: {
        flex: 1,
        backgroundColor: '#111',
        margin: 20,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden', // Contain the crop box visual
    },
    cropBox: {
        position: 'absolute',
        borderWidth: 2,
        borderColor: 'white',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    gridLineVertical: {
        position: 'absolute',
        left: '33%',
        height: '100%',
        width: 1,
        backgroundColor: 'rgba(255,255,255,0.3)',
    },
    gridLineHorizontal: {
        position: 'absolute',
        top: '33%',
        width: '100%',
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.3)',
    },
    cornerHandle: {
        position: 'absolute',
        bottom: -10,
        right: -10,
        padding: 10, // Hit slop
    }
});
