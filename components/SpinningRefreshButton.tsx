import React, { useRef, useState, useEffect } from 'react';
import {
  TouchableOpacity,
  Animated,
  Easing,
  StyleSheet,
  View,
  Text,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';

export interface SpinningRefreshButtonProps {
  onRefresh: () => Promise<void> | void;
  isArabic?: boolean;
  isRefreshing?: boolean;
  color?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  showToastOnComplete?: boolean;
}

export default function SpinningRefreshButton({
  onRefresh,
  isArabic = false,
  isRefreshing = false,
  color = '#9b8d97',
  size = 20,
  style,
  showToastOnComplete = true,
}: SpinningRefreshButtonProps) {
  const spinAnim = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);
  const [internalRefreshing, setInternalRefreshing] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const toastOpacity = useRef(new Animated.Value(0)).current;

  const isActive = isRefreshing || internalRefreshing;

  // Handle spinning animation loop
  useEffect(() => {
    if (isActive) {
      spinAnim.setValue(0);
      loopRef.current = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 750,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      loopRef.current.start();
    } else {
      if (loopRef.current) {
        loopRef.current.stop();
        loopRef.current = null;
      }
      Animated.timing(spinAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
  }, [isActive, spinAnim]);

  const handlePress = async () => {
    if (isActive) return;
    setInternalRefreshing(true);
    try {
      await onRefresh();
      if (showToastOnComplete) {
        setShowToast(true);
        Animated.timing(toastOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }).start();

        setTimeout(() => {
          Animated.timing(toastOpacity, {
            toValue: 0,
            duration: 250,
            useNativeDriver: true,
          }).start(() => setShowToast(false));
        }, 1500);
      }
    } finally {
      setInternalRefreshing(false);
    }
  };

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <>
      <TouchableOpacity
        onPress={handlePress}
        disabled={isActive}
        activeOpacity={0.7}
        style={[styles.button, style]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Animated.View style={{ transform: [{ rotate: spin }] }}>
          <MaterialIcons name="refresh" size={size} color={isActive ? Colors.brandTeal : color} />
        </Animated.View>
      </TouchableOpacity>

      {showToast && (
        <Animated.View
          style={[
            styles.toastContainer,
            { opacity: toastOpacity, flexDirection: isArabic ? 'row-reverse' : 'row' },
          ]}
          pointerEvents="none"
        >
          <MaterialIcons name="check-circle" size={14} color="#34ff8c" />
          <Text style={styles.toastText}>
            {isArabic ? 'تم التحديث ✓' : 'Updated ✓'}
          </Text>
        </Animated.View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#282a2b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastContainer: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    zIndex: 9999,
    backgroundColor: '#1e2020',
    borderWidth: 1,
    borderColor: '#34ff8c',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  toastText: {
    color: '#34ff8c',
    fontSize: 12,
    fontWeight: '700',
  },
});
