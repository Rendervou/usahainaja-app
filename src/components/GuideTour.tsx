import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

export type TourPage = "dashboard" | "products" | "sales" | "debts" | "expenses";

export type TourStep = {
  page: TourPage;
  /** indeks tab di navbar yang disorot, null jika tidak ada */
  tab: number | null;
  title: string;
  body: string;
};

// Urutan tab: 0 Ringkasan, 1 Produk, 2 Jual, 3 Kasbon, 4 Biaya
export const TOUR_STEPS: TourStep[] = [
  {
    page: "dashboard",
    tab: null,
    title: "Selamat datang di Usahain.aja",
    body: "Kita keliling singkat, kurang dari satu menit. Kamu bisa melewatinya kapan saja.",
  },
  {
    page: "products",
    tab: 1,
    title: "1. Tambahkan produk",
    body: "Mulai dari tab Produk. Isi nama, harga jual, dan HPP (biaya membuat satu unit). Stok boleh diisi kalau ingin dilacak.",
  },
  {
    page: "sales",
    tab: 2,
    title: "2. Catat penjualan",
    body: "Di tab Jual, pilih produk, atur jumlah, lalu pilih pembayaran: Tunai, QRIS, Transfer, atau Kasbon.",
  },
  {
    page: "debts",
    tab: 3,
    title: "3. Pantau kasbon",
    body: "Penjualan kasbon muncul di sini sampai lunas. Tekan Terima pembayaran saat pelanggan membayar, boleh dicicil.",
  },
  {
    page: "expenses",
    tab: 4,
    title: "4. Catat pengeluaran",
    body: "Biaya seperti sewa, gaji, dan listrik dicatat di tab Biaya supaya laba bersihmu akurat.",
  },
  {
    page: "dashboard",
    tab: 0,
    title: "5. Lihat hasilnya",
    body: "Ringkasan menampilkan omzet, laba, uang masuk per metode, target bulanan, dan insight bisnis.",
  },
  {
    page: "dashboard",
    tab: null,
    title: "Siap mulai!",
    body: "Tombol Panduan di kanan atas selalu bisa dibuka lagi. Catat transaksi setiap hari agar angkanya akurat.",
  },
];

const COLORS = {
  ink: "#1C1C1E",
  green: "#1E6844",
  mint: "#DFF0E5",
  muted: "#6C6C70",
  line: "#E5E5EA",
  dim: "rgba(0, 0, 0, 0.5)",
};

type Props = {
  step: number;
  tabCount: number;
  tabBarHeight: number;
  onNext: () => void;
  onBack: () => void;
  onClose: () => void;
  onOpenFullGuide: () => void;
};

export default function GuideTour({
  step,
  tabCount,
  tabBarHeight,
  onNext,
  onBack,
  onClose,
  onOpenFullGuide,
}: Props) {
  const { width } = useWindowDimensions();
  const current = TOUR_STEPS[step];
  const isLast = step === TOUR_STEPS.length - 1;
  const cellWidth = width / tabCount;

  const pulse = useRef(new Animated.Value(0)).current;
  const bounce = useRef(new Animated.Value(0)).current;
  const enter = useRef(new Animated.Value(0)).current;

  // Denyut cincin dan panah memantul, berjalan terus selama tur
  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    const bounceLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, {
          toValue: 1,
          duration: 450,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(bounce, {
          toValue: 0,
          duration: 450,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    pulseLoop.start();
    bounceLoop.start();
    return () => {
      pulseLoop.stop();
      bounceLoop.stop();
    };
  }, [pulse, bounce]);

  // Kartu petunjuk muncul geser-naik setiap pindah langkah
  useEffect(() => {
    enter.setValue(0);
    Animated.timing(enter, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [step, enter]);

  const hasTarget = current.tab !== null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Latar redup di atas navbar (menahan sentuhan ke layar di belakang) */}
      <Pressable
        accessibilityLabel="Latar panduan"
        style={[styles.dimTop, { bottom: tabBarHeight }]}
        onPress={() => {}}
      />

      {/* Navbar: semua tab diredupkan kecuali tab yang disorot */}
      <View style={[styles.tabRow, { height: tabBarHeight }]}>
        {Array.from({ length: tabCount }).map((_, i) => (
          <Pressable
            key={i}
            style={[styles.cell, i !== current.tab && styles.cellDim]}
            onPress={() => {}}
          />
        ))}
      </View>

      {/* Cincin berdenyut + panah di tab yang disorot */}
      {hasTarget && (
        <>
          <View
            pointerEvents="none"
            style={[
              styles.ringBase,
              {
                width: cellWidth - 12,
                height: tabBarHeight - 12,
                left: (current.tab as number) * cellWidth + 6,
                bottom: 6,
              },
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.ringPulse,
              {
                width: cellWidth - 12,
                height: tabBarHeight - 12,
                left: (current.tab as number) * cellWidth + 6,
                bottom: 6,
                opacity: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.9, 0],
                }),
                transform: [
                  {
                    scale: pulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 1.28],
                    }),
                  },
                ],
              },
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.arrow,
              {
                width: cellWidth,
                left: (current.tab as number) * cellWidth,
                bottom: tabBarHeight + 6,
                transform: [
                  {
                    translateY: bounce.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 10],
                    }),
                  },
                ],
              },
            ]}
          >
            <Ionicons name="arrow-down" size={28} color="#FFFFFF" />
          </Animated.View>
        </>
      )}

      {/* Kartu petunjuk */}
      <Animated.View
        style={[
          styles.card,
          {
            bottom: tabBarHeight + (hasTarget ? 52 : 24),
            opacity: enter,
            transform: [
              {
                translateY: enter.interpolate({
                  inputRange: [0, 1],
                  outputRange: [18, 0],
                }),
              },
            ],
          },
        ]}
      >
        <Text style={styles.counter}>
          Langkah {step + 1} dari {TOUR_STEPS.length}
        </Text>
        <Text style={styles.title}>{current.title}</Text>
        <Text style={styles.body}>{current.body}</Text>

        <View style={styles.dots}>
          {TOUR_STEPS.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === step && styles.dotActive,
                i < step && styles.dotDone,
              ]}
            />
          ))}
        </View>

        <View style={styles.actions}>
          {!isLast ? (
            <Pressable hitSlop={8} onPress={onClose}>
              <Text style={styles.skip}>Lewati</Text>
            </Pressable>
          ) : (
            <Pressable hitSlop={8} onPress={onOpenFullGuide}>
              <Text style={styles.skip}>Panduan lengkap</Text>
            </Pressable>
          )}
          <View style={styles.spacer} />
          {step > 0 && (
            <Pressable style={styles.backBtn} onPress={onBack}>
              <Text style={styles.backText}>Kembali</Text>
            </Pressable>
          )}
          <Pressable style={styles.nextBtn} onPress={onNext}>
            <Text style={styles.nextText}>
              {step === 0 ? "Mulai" : isLast ? "Selesai" : "Lanjut"}
            </Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  dimTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.dim,
  },
  tabRow: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
  },
  cell: { flex: 1 },
  cellDim: { backgroundColor: COLORS.dim },

  ringBase: {
    position: "absolute",
    borderRadius: 14,
    borderWidth: 2,
    borderColor: COLORS.green,
    backgroundColor: "rgba(30, 104, 68, 0.08)",
  },
  ringPulse: {
    position: "absolute",
    borderRadius: 14,
    borderWidth: 2,
    borderColor: COLORS.green,
  },
  arrow: {
    position: "absolute",
    alignItems: "center",
  },

  card: {
    position: "absolute",
    left: 20,
    right: 20,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  counter: { fontSize: 12, color: COLORS.muted, fontWeight: "600" },
  title: { fontSize: 20, fontWeight: "700", color: COLORS.ink, letterSpacing: -0.3, marginTop: 6 },
  body: { fontSize: 15, lineHeight: 22, color: COLORS.muted, marginTop: 6 },

  dots: { flexDirection: "row", gap: 6, marginTop: 14 },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.line,
  },
  dotActive: { width: 20, backgroundColor: COLORS.green },
  dotDone: { backgroundColor: "#B7DCC4" },

  actions: { flexDirection: "row", alignItems: "center", marginTop: 16, gap: 10 },
  spacer: { flex: 1 },
  skip: { color: COLORS.muted, fontWeight: "500", fontSize: 15 },
  backBtn: {
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#F2F2F7",
  },
  backText: { color: COLORS.muted, fontWeight: "700", fontSize: 14 },
  nextBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 14,
    backgroundColor: COLORS.green,
  },
  nextText: { color: "#FFFFFF", fontWeight: "600", fontSize: 15 },
});