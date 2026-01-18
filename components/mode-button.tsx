import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import VOPressable from './vo-pressable';

type Props = {
  label: string;
  subtitle?: string;
  color: string;
  iconName?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: any;
  iconSize?: number;
};

export default function ModeButton({ label, subtitle, color, iconName = 'photo', onPress, accessibilityLabel, style, iconSize }: Props) {
  return (
    <VOPressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={subtitle}
      detailedDescription={subtitle}
      containerStyle={[styles.container, { backgroundColor: color }, style]}
      onPress={onPress}
    >
      {/* subtle overlay to simulate a glossy gradient without adding dependencies */}
      <View style={styles.surfaceOverlay} pointerEvents="none" />
      <View style={styles.innerRow}>
        <View style={styles.leftIconWrap}>
          <View style={styles.iconCircle} />
          <MaterialIcons name={iconName as any} size={iconSize ?? 46} color="#fff" accessibilityIgnoresInvertColors style={styles.icon} />
        </View>

        <View style={styles.textCol}>
          <Text style={styles.label} accessibilityRole="text" numberOfLines={2} ellipsizeMode="tail">{label}</Text>
          {subtitle ? <Text style={styles.subtitle} numberOfLines={2} ellipsizeMode="tail">{subtitle}</Text> : null}
        </View>

        <View style={styles.dotsWrap}>
          <View style={[styles.dot, { backgroundColor: 'rgba(255,255,255,0.08)' }]} />
          <View style={[styles.dot, { backgroundColor: 'rgba(255,255,255,0.06)', marginTop: 18 }]} />
        </View>
      </View>
    </VOPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 110,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 8,
    elevation: 3,
    flexShrink: 0,
  },
  iconWrap: {
    marginBottom: 8,
  },
  innerRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftIconWrap: {
    width: 82,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconCircle: {
    position: 'absolute',
    left: 12,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.12)'
  },
  surfaceOverlay: {
    ...StyleSheet.absoluteFillObject as any,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  icon: {
    marginLeft: 8,
  },
  label: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'left',
    flexShrink: 1,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 13,
    marginTop: 4,
    textAlign: 'left',
    flexShrink: 1,
  },
  textCol: {
    flex: 1,
    paddingLeft: 12,
  },
  dotsWrap: {
    width: 72,
    alignItems: 'flex-end',
    paddingRight: 12,
    justifyContent: 'center'
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 6,
    opacity: 0.95,
  },
});
