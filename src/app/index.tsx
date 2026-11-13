import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSQLiteContext } from "expo-sqlite";

type Page = "dashboard" | "products" | "sales" | "expenses" | "debts";
type Method = "tunai" | "qris" | "transfer" | "kasbon";
type PayVia = Exclude<Method, "kasbon">;
type Period = "today" | "7days" | "30days";

type Product = {
  stock: number | null;
  min_stock: number;
  id: number;
  name: string;
  unit_price: number;
  unit_cost: number;
  created_at: string;
};

type Sale = {
  product_id: number | null;
  payment_method: Method;
  customer: string;
  id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  created_at: string;
};

type Expense = {
  id: number;
  category: string;
  note: string;
  amount: number;
  created_at: string;
};

const C = {
  bg: "#F3F6F2",
  card: "#FFFFFF",
  ink: "#12301F",
  muted: "#6B7A70",
  neutral: "#8B948E",
  line: "#E3EAE4",
  green: "#1E6844",
  greenDark: "#134A2F",
  mint: "#DFF0E5",
  gold: "#F2B84B",
  goldSoft: "#FFF4DC",
  red: "#C0463B",
  redSoft: "#FBE9E6",
};

const PERIODS: { label: string; value: Period; long: string }[] = [
  { label: "Hari ini", value: "today", long: "hari ini" },
  { label: "7 hari", value: "7days", long: "7 hari terakhir" },
  { label: "30 hari", value: "30days", long: "30 hari terakhir" },
];

const CATEGORIES = [
  "Bahan baku",
  "Gaji",
  "Sewa",
  "Listrik & air",
  "Transport",
  "Marketing",
  "Lainnya",
];

const DAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const DAYS_FULL = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

type Insight = { tone: "good" | "warn" | "info"; text: string };

type DebtPayment = {
  id: number;
  sale_id: number;
  amount: number;
  method: PayVia;
  created_at: string;
};

type Debtor = {
  key: string;
  name: string;
  remaining: number;
  items: { sale: Sale; remaining: number }[];
};

const METHODS: { key: Method; label: string }[] = [
  { key: "tunai", label: "Tunai" },
  { key: "qris", label: "QRIS" },
  { key: "transfer", label: "Transfer" },
  { key: "kasbon", label: "Kasbon" },
];
const PAY_METHODS = METHODS.filter((m) => m.key !== "kasbon") as {
  key: PayVia;
  label: string;
}[];
const METHOD_LABEL: Record<string, string> = {
  tunai: "Tunai",
  qris: "QRIS",
  transfer: "Transfer",
  kasbon: "Kasbon",
};

const rupiah = (v: number) =>
  `${v < 0 ? "-" : ""}Rp${Math.abs(Math.round(v)).toLocaleString("id-ID")}`;

const shortRupiah = (v: number) => {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(".", ",")}jt`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}rb`;
  return v > 0 ? String(v) : "";
};

const parseDigits = (v: string) => v.replace(/\D/g, "");
const formatInputRupiah = (v: string) => {
  const d = parseDigits(v);
  return d ? `Rp${Number(d).toLocaleString("id-ID")}` : "";
};

const dateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const isPositiveInteger = (v: string) =>
  /^\d+$/.test(v) && Number.isSafeInteger(Number(v)) && Number(v) > 0;

const greeting = () => {
  const h = new Date().getHours();
  if (h < 11) return "Selamat pagi";
  if (h < 15) return "Selamat siang";
  if (h < 18) return "Selamat sore";
  return "Selamat malam";
};

const friendlyTime = (iso: string) => {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dateKey(d) === dateKey(now)) return `Hari ini, ${time}`;
  if (dateKey(d) === dateKey(yesterday)) return `Kemarin, ${time}`;
  return `${d.toLocaleDateString("id-ID", { day: "numeric", month: "short" })}, ${time}`;
};

export default function HomeScreen() {
  const db = useSQLiteContext();
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);

  const [page, setPage] = useState<Page>("dashboard");
  const [period, setPeriod] = useState<Period>("today");
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  const [productName, setProductName] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState("1");

  const [expCategory, setExpCategory] = useState(CATEGORIES[0]);
  const [expAmount, setExpAmount] = useState("");
  const [expNote, setExpNote] = useState("");

  const [target, setTarget] = useState(0);
  const [targetInput, setTargetInput] = useState("");
  const [editingTarget, setEditingTarget] = useState(false);

  const [stockInput, setStockInput] = useState("");
  const [minStockInput, setMinStockInput] = useState("");
  const [restockId, setRestockId] = useState<number | null>(null);
  const [restockQty, setRestockQty] = useState("");

  const [payMethod, setPayMethod] = useState<Method>("tunai");
  const [customerName, setCustomerName] = useState("");
  const [debtPayments, setDebtPayments] = useState<DebtPayment[]>([]);
  const [payingKey, setPayingKey] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payVia, setPayVia] = useState<PayVia>("tunai");
  const [savingPay, setSavingPay] = useState(false);

  const [loading, setLoading] = useState(true);
  const [savingProduct, setSavingProduct] = useState(false);
  const [savingSale, setSavingSale] = useState(false);
  const [savingExpense, setSavingExpense] = useState(false);

  const [toast, setToast] = useState("");
  const toastAnim = useRef(new Animated.Value(0)).current;

  function showToast(message: string) {
    setToast(message);
    toastAnim.setValue(0);
    Animated.sequence([
      Animated.timing(toastAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.delay(1800),
      Animated.timing(toastAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }

  const loadData = useCallback(async () => {
    const [productRows, saleRows, expenseRows, paymentRows] = await Promise.all([
      db.getAllAsync<Product>("SELECT * FROM products ORDER BY id DESC"),
      db.getAllAsync<Sale>("SELECT * FROM sales ORDER BY id DESC"),
      db.getAllAsync<Expense>("SELECT * FROM expenses ORDER BY id DESC"),
      db.getAllAsync<DebtPayment>("SELECT * FROM debt_payments ORDER BY id DESC"),
    ]);
    setDebtPayments(paymentRows);
    setProducts(productRows);
    setSales(saleRows);
    setExpenses(expenseRows);

    const targetRow = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM settings WHERE key = 'monthly_target'",
    );
    setTarget(targetRow ? Number(targetRow.value) || 0 : 0);
  }, [db]);

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        await db.execAsync(
          "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
        );
        await loadData();
      } catch (error) {
        console.error("Gagal memuat data:", error);
        Alert.alert("Gagal memuat data", "Periksa database lalu coba lagi.");
      } finally {
        if (active) setLoading(false);
      }
    }
    initialize();
    return () => {
      active = false;
    };
  }, [loadData]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [page]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedId) ?? null,
    [products, selectedId],
  );

  const inPeriod = useMemo(() => {
    const now = new Date();
    const today = dateKey(now);
    const start = new Date(now);
    if (period === "7days") start.setDate(start.getDate() - 6);
    else if (period === "30days") start.setDate(start.getDate() - 29);
    const startKey = dateKey(start);
    return (iso: string) => {
      const k = dateKey(new Date(iso));
      return period === "today" ? k === today : k >= startKey && k <= today;
    };
  }, [period]);

  const filteredSales = useMemo(
    () => sales.filter((s) => inPeriod(s.created_at)),
    [sales, inPeriod],
  );
  const filteredExpenses = useMemo(
    () => expenses.filter((e) => inPeriod(e.created_at)),
    [expenses, inPeriod],
  );

  const revenue = filteredSales.reduce(
    (s, x) => s + x.quantity * x.unit_price,
    0,
  );
  const grossProfit = filteredSales.reduce(
    (s, x) => s + x.quantity * (x.unit_price - x.unit_cost),
    0,
  );
  const expenseTotal = filteredExpenses.reduce((s, e) => s + e.amount, 0);
  const netProfit = grossProfit - expenseTotal;
  const margin = revenue > 0 ? Math.round((netProfit / revenue) * 100) : 0;

  const bestSeller = useMemo(() => {
    const map = new Map<string, number>();
    filteredSales.forEach((s) =>
      map.set(s.product_name, (map.get(s.product_name) ?? 0) + s.quantity),
    );
    let top: { name: string; qty: number } | null = null;
    map.forEach((qty, name) => {
      if (!top || qty > top.qty) top = { name, qty };
    });
    return top as { name: string; qty: number } | null;
  }, [filteredSales]);

  const week = useMemo(() => {
    const days: { key: string; label: string; value: number; today: boolean }[] =
      [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push({
        key: dateKey(d),
        label: DAYS[d.getDay()],
        value: 0,
        today: i === 0,
      });
    }
    sales.forEach((s) => {
      const day = days.find((x) => x.key === dateKey(new Date(s.created_at)));
      if (day) day.value += s.quantity * s.unit_price;
    });
    return days;
  }, [sales]);
  const weekMax = Math.max(...week.map((d) => d.value), 1);

  const monthStats = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const inMonth = (iso: string) => {
      const d = new Date(iso);
      return d.getFullYear() === y && d.getMonth() === m;
    };
    const monthSales = sales.filter((x) => inMonth(x.created_at));
    const gross = monthSales.reduce(
      (t, x) => t + x.quantity * (x.unit_price - x.unit_cost),
      0,
    );
    const units = monthSales.reduce((t, x) => t + x.quantity, 0);
    const exp = expenses
      .filter((e) => inMonth(e.created_at))
      .reduce((t, e) => t + e.amount, 0);
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    return {
      gross,
      units,
      exp,
      net: gross - exp,
      daysLeft: daysInMonth - now.getDate() + 1,
    };
  }, [sales, expenses]);

  const unitProfit =
    monthStats.units > 0
      ? monthStats.gross / monthStats.units
      : products.length > 0
        ? products.reduce((t, p) => t + (p.unit_price - p.unit_cost), 0) /
          products.length
        : 0;
  const remainingTarget = Math.max(0, target - monthStats.net);
  const unitsNeeded =
    unitProfit > 0 ? Math.ceil(remainingTarget / unitProfit) : null;
  const targetPct =
    target > 0
      ? Math.min(100, Math.max(0, Math.round((monthStats.net / target) * 100)))
      : 0;
  const breakEvenGap = monthStats.exp - monthStats.gross;
  const breakEvenUnits =
    unitProfit > 0 && breakEvenGap > 0
      ? Math.ceil(breakEvenGap / unitProfit)
      : null;

  const insights = useMemo<Insight[]>(() => {
    const list: Insight[] = [];
    if (sales.length === 0) return list;

    const DAY = 86400000;
    const now = Date.now();
    const ago = (iso: string) => (now - new Date(iso).getTime()) / DAY;
    const revenueBetween = (from: number, to: number) =>
      sales
        .filter((x) => {
          const a = ago(x.created_at);
          return a >= from && a < to;
        })
        .reduce((t, x) => t + x.quantity * x.unit_price, 0);
    const expenseBetween = (from: number, to: number) =>
      expenses
        .filter((e) => {
          const a = ago(e.created_at);
          return a >= from && a < to;
        })
        .reduce((t, e) => t + e.amount, 0);

    // 1. Tren omzet mingguan
    const cur = revenueBetween(0, 7);
    const prev = revenueBetween(7, 14);
    if (prev > 0) {
      const change = Math.round(((cur - prev) / prev) * 100);
      if (change >= 5) {
        list.push({
          tone: "good",
          text: `Omzet 7 hari terakhir naik ${change}% dibanding 7 hari sebelumnya.`,
        });
      } else if (change <= -5) {
        list.push({
          tone: "warn",
          text: `Omzet 7 hari terakhir turun ${Math.abs(change)}% dibanding 7 hari sebelumnya.`,
        });
      } else {
        list.push({
          tone: "info",
          text: "Omzet 7 hari terakhir relatif stabil dibanding minggu sebelumnya.",
        });
      }
    }

    // 2. Produk terlaris dan marginnya
    const recent = sales.filter((x) => ago(x.created_at) < 30);
    const byName = new Map<string, { qty: number; rev: number; profit: number }>();
    recent.forEach((x) => {
      const e = byName.get(x.product_name) ?? { qty: 0, rev: 0, profit: 0 };
      e.qty += x.quantity;
      e.rev += x.quantity * x.unit_price;
      e.profit += x.quantity * (x.unit_price - x.unit_cost);
      byName.set(x.product_name, e);
    });
    const totalRev = recent.reduce((t, x) => t + x.quantity * x.unit_price, 0);
    const top = Array.from(byName.entries()).sort(
      (a, b) => b[1].qty - a[1].qty,
    )[0];
    if (top && totalRev > 0) {
      const [name, d] = top;
      const m = d.rev > 0 ? Math.round((d.profit / d.rev) * 100) : 0;
      const share = Math.round((d.rev / totalRev) * 100);
      if (m < 20) {
        list.push({
          tone: "warn",
          text: `${name} paling laris, tapi marginnya hanya ${m}%. Pertimbangkan menaikkan harga atau menekan HPP.`,
        });
      } else if (byName.size > 1) {
        list.push({
          tone: "good",
          text: `${name} paling laris dan menyumbang ${share}% omzet 30 hari terakhir.`,
        });
      } else {
        list.push({
          tone: "good",
          text: `${name} paling laris dengan margin ${m}%.`,
        });
      }
    }

    // 3. Hari paling ramai
    const dates = new Set(sales.map((x) => dateKey(new Date(x.created_at))));
    if (sales.length >= 10 && dates.size >= 7) {
      const perDay = [0, 0, 0, 0, 0, 0, 0];
      sales.forEach((x) => {
        perDay[new Date(x.created_at).getDay()] += x.quantity * x.unit_price;
      });
      const best = perDay.indexOf(Math.max(...perDay));
      if (perDay[best] > 0) {
        list.push({
          tone: "info",
          text: `Hari ${DAYS_FULL[best]} biasanya paling ramai. Siapkan stok lebih banyak.`,
        });
      }
    }

    // 4. Tren pengeluaran
    const ec = expenseBetween(0, 30);
    const ep = expenseBetween(30, 60);
    if (ep > 0 && ec > 0) {
      const ch = Math.round(((ec - ep) / ep) * 100);
      if (ch >= 20) {
        list.push({
          tone: "warn",
          text: `Pengeluaran 30 hari terakhir naik ${ch}% dibanding 30 hari sebelumnya.`,
        });
      } else if (ch <= -20) {
        list.push({
          tone: "good",
          text: `Pengeluaran 30 hari terakhir turun ${Math.abs(ch)}% dibanding 30 hari sebelumnya.`,
        });
      }
    }

    // 5. Produk tidak laku
    const soldNames = new Set(
      sales.filter((x) => ago(x.created_at) < 14).map((x) => x.product_name),
    );
    const idle = products.filter(
      (x) => ago(x.created_at) >= 14 && !soldNames.has(x.name),
    );
    if (idle.length > 0) {
      const names = idle.slice(0, 2).map((x) => x.name).join(", ");
      const more = idle.length > 2 ? ` dan ${idle.length - 2} lainnya` : "";
      list.push({
        tone: "info",
        text: `${names}${more} belum terjual dalam 14 hari terakhir.`,
      });
    }

    const rank = { warn: 0, good: 1, info: 2 };
    return list.sort((a, b) => rank[a.tone] - rank[b.tone]).slice(0, 4);
  }, [sales, expenses, products]);

  const expenseByCategory = useMemo(() => {
    const map = new Map<string, number>();
    filteredExpenses.forEach((e) =>
      map.set(e.category, (map.get(e.category) ?? 0) + e.amount),
    );
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [filteredExpenses]);

  const visibleProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? products.filter((p) => p.name.toLowerCase().includes(q))
      : products;
  }, [products, search]);

  const paidBySale = useMemo(() => {
    const m = new Map<number, number>();
    debtPayments.forEach((d) =>
      m.set(d.sale_id, (m.get(d.sale_id) ?? 0) + d.amount),
    );
    return m;
  }, [debtPayments]);

  const debtors = useMemo(() => {
    const map = new Map<string, Debtor>();
    // sales diurutkan terbaru dulu; dibalik agar tagihan terlama dilunasi lebih dulu
    [...sales]
      .filter((x) => x.payment_method === "kasbon")
      .reverse()
      .forEach((x) => {
        const remaining = x.quantity * x.unit_price - (paidBySale.get(x.id) ?? 0);
        if (remaining <= 0) return;
        const name = x.customer.trim() || "Tanpa nama";
        const key = name.toLowerCase();
        const e = map.get(key) ?? { key, name, remaining: 0, items: [] };
        e.remaining += remaining;
        e.items.push({ sale: x, remaining });
        map.set(key, e);
      });
    return Array.from(map.values()).sort((a, b) => b.remaining - a.remaining);
  }, [sales, paidBySale]);
  const totalReceivable = debtors.reduce((t, d) => t + d.remaining, 0);

  const methodRecap = useMemo(() => {
    const r: Record<Method, number> = { tunai: 0, qris: 0, transfer: 0, kasbon: 0 };
    filteredSales.forEach((x) => {
      r[x.payment_method] += x.quantity * x.unit_price;
    });
    debtPayments
      .filter((d) => inPeriod(d.created_at))
      .forEach((d) => {
        r[d.method] += d.amount;
      });
    return r;
  }, [filteredSales, debtPayments, inPeriod]);
  const cashIn = methodRecap.tunai + methodRecap.qris + methodRecap.transfer;

  const lowStock = useMemo(
    () =>
      products
        .filter((x) => x.stock !== null && x.stock <= x.min_stock)
        .sort((a, b) => (a.stock as number) - (b.stock as number)),
    [products],
  );

  const formPrice = Number(price) || 0;
  const formCost = Number(cost) || 0;
  const formProfit = formPrice - formCost;
  const formMargin =
    formPrice > 0 ? Math.round((formProfit / formPrice) * 100) : 0;

  const periodLabel = PERIODS.find((p) => p.value === period)?.long ?? "";

  /* ---------- Produk ---------- */

  function resetProductForm() {
    setEditingId(null);
    setProductName("");
    setPrice("");
    setCost("");
    setStockInput("");
    setMinStockInput("");
  }

  function startEdit(product: Product) {
    setEditingId(product.id);
    setProductName(product.name);
    setPrice(String(product.unit_price));
    setCost(String(product.unit_cost));
    setStockInput(product.stock === null ? "" : String(product.stock));
    setMinStockInput(String(product.min_stock));
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }

  async function saveProduct() {
    if (savingProduct) return;

    const name = productName.trim();
    const p = Number(price);
    const c = Number(cost);

    if (!name) {
      Alert.alert("Nama produk kosong", "Masukkan nama produk terlebih dahulu.");
      return;
    }

    if (
      (stockInput !== "" && !/^\d+$/.test(stockInput)) ||
      (minStockInput !== "" && !/^\d+$/.test(minStockInput))
    ) {
      Alert.alert("Stok belum valid", "Stok dan batas stok harus berupa angka bulat.");
      return;
    }

    if (
      !isPositiveInteger(price) ||
      !Number.isSafeInteger(p) ||
      !/^\d+$/.test(cost) ||
      !Number.isSafeInteger(c) ||
      c < 0
    ) {
      Alert.alert(
        "Input belum valid",
        "Harga jual harus lebih dari Rp0 dan HPP minimal Rp0. Masukkan angka yang valid.",
      );
      return;
    }

    if (c > p) {
      Alert.alert(
        "Periksa HPP",
        "HPP lebih besar daripada harga jual, jadi produk ini akan rugi. Pastikan nilainya benar.",
        [
          { text: "Periksa lagi", style: "cancel" },
          { text: "Tetap simpan", onPress: () => persistProduct(name, p, c) },
        ],
      );
      return;
    }

    await persistProduct(name, p, c);
  }

  async function persistProduct(name: string, p: number, c: number) {
    if (savingProduct) return;
    setSavingProduct(true);
    try {
      const stockVal = stockInput === "" ? null : Number(stockInput);
      const minVal = minStockInput === "" ? 5 : Number(minStockInput);
      if (editingId !== null) {
        await db.runAsync(
          "UPDATE products SET name = ?, unit_price = ?, unit_cost = ?, stock = ?, min_stock = ? WHERE id = ?",
          name,
          p,
          c,
          stockVal,
          minVal,
          editingId,
        );
      } else {
        await db.runAsync(
          `INSERT INTO products (name, unit_price, unit_cost, stock, min_stock, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          name,
          p,
          c,
          stockVal,
          minVal,
          new Date().toISOString(),
        );
      }
      const wasEditing = editingId !== null;
      resetProductForm();
      await loadData();
      showToast(wasEditing ? "Produk diperbarui" : "Produk berhasil ditambahkan");
    } catch (error) {
      console.error("Gagal menyimpan produk:", error);
      Alert.alert("Gagal menyimpan", "Produk belum berhasil disimpan.");
    } finally {
      setSavingProduct(false);
    }
  }

  function confirmDeleteProduct(product: Product) {
    Alert.alert(
      `Hapus ${product.name}?`,
      "Produk dihapus dari katalog. Riwayat penjualan yang sudah tercatat tetap aman.",
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Hapus",
          style: "destructive",
          onPress: async () => {
            try {
              await db.runAsync("DELETE FROM products WHERE id = ?", product.id);
              if (selectedId === product.id) setSelectedId(null);
              if (editingId === product.id) resetProductForm();
              await loadData();
              showToast("Produk dihapus");
            } catch (error) {
              console.error("Gagal menghapus produk:", error);
              Alert.alert("Gagal menghapus", "Produk belum berhasil dihapus.");
            }
          },
        },
      ],
    );
  }

  /* ---------- Penjualan ---------- */

  async function saveSale() {
    if (savingSale) return;

    if (!selectedProduct) {
      Alert.alert("Pilih produk", "Pilih produk terlebih dahulu.");
      return;
    }

    if (!isPositiveInteger(quantity)) {
      Alert.alert(
        "Jumlah belum valid",
        "Jumlah terjual harus berupa bilangan bulat positif.",
      );
      return;
    }

    const qty = Number(quantity);
    if (
      !Number.isSafeInteger(qty * selectedProduct.unit_price) ||
      !Number.isSafeInteger(qty * selectedProduct.unit_cost)
    ) {
      Alert.alert(
        "Jumlah terlalu besar",
        "Kurangi jumlah terjual agar total transaksi tetap dalam batas yang aman.",
      );
      return;
    }

    if (selectedProduct.stock !== null && qty > selectedProduct.stock) {
      Alert.alert(
        "Stok tidak cukup",
        `Stok ${selectedProduct.name} tersisa ${selectedProduct.stock}. Kurangi jumlah atau tambahkan stok di tab Produk.`,
      );
      return;
    }

    const customer = customerName.trim();
    if (payMethod === "kasbon" && !customer) {
      Alert.alert("Nama pelanggan kosong", "Isi nama pelanggan untuk penjualan kasbon.");
      return;
    }

    setSavingSale(true);
    try {
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          `INSERT INTO sales
            (product_id, product_name, quantity, unit_price, unit_cost, payment_method, customer, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          selectedProduct.id,
          selectedProduct.name,
          qty,
          selectedProduct.unit_price,
          selectedProduct.unit_cost,
          payMethod,
          payMethod === "kasbon" ? customer : "",
          new Date().toISOString(),
        );
        if (selectedProduct.stock !== null) {
          await db.runAsync(
            "UPDATE products SET stock = stock - ? WHERE id = ?",
            qty,
            selectedProduct.id,
          );
        }
      });
      setPayMethod("tunai");
      setCustomerName("");
      setQuantity("1");
      setSelectedId(null);
      setPeriod("today");
      await loadData();
      setPage("dashboard");
      showToast("Penjualan berhasil dicatat");
    } catch (error) {
      console.error("Gagal menyimpan penjualan:", error);
      Alert.alert("Gagal menyimpan", "Penjualan belum berhasil dicatat.");
    } finally {
      setSavingSale(false);
    }
  }

  function confirmDeleteSale(sale: Sale) {
    const tracked =
      sale.product_id !== null &&
      products.find((x) => x.id === sale.product_id)?.stock != null;
    const restoreNote =
      (tracked ? " Stok produk akan dikembalikan." : "") +
      (sale.payment_method === "kasbon"
        ? " Catatan pembayaran kasbon transaksi ini juga ikut dihapus."
        : "");
    Alert.alert(
      "Batalkan transaksi?",
      `${sale.quantity} × ${sale.product_name} (${rupiah(
        sale.quantity * sale.unit_price,
      )}) akan dihapus dari riwayat dan ringkasan.${restoreNote}`,
      [
        { text: "Tidak", style: "cancel" },
        {
          text: "Batalkan transaksi",
          style: "destructive",
          onPress: async () => {
            try {
              await db.withTransactionAsync(async () => {
                await db.runAsync("DELETE FROM debt_payments WHERE sale_id = ?", sale.id);
                await db.runAsync("DELETE FROM sales WHERE id = ?", sale.id);
                if (sale.product_id !== null) {
                  await db.runAsync(
                    "UPDATE products SET stock = stock + ? WHERE id = ? AND stock IS NOT NULL",
                    sale.quantity,
                    sale.product_id,
                  );
                }
              });
              await loadData();
              showToast("Transaksi dibatalkan");
            } catch (error) {
              console.error("Gagal membatalkan transaksi:", error);
              Alert.alert("Gagal membatalkan", "Transaksi belum berhasil dihapus.");
            }
          },
        },
      ],
    );
  }

  function changeQty(delta: number) {
    setQuantity(String(Math.max(1, (Number(quantity) || 0) + delta)));
  }

  function startSale() {
    setSelectedId(null);
    setQuantity("1");
    setPage("sales");
  }

  /* ---------- Pengeluaran ---------- */

  async function saveExpense() {
    if (savingExpense) return;

    const amount = Number(expAmount);
    if (!isPositiveInteger(expAmount) || !Number.isSafeInteger(amount)) {
      Alert.alert(
        "Nominal belum valid",
        "Masukkan nominal pengeluaran lebih dari Rp0.",
      );
      return;
    }

    setSavingExpense(true);
    try {
      await db.runAsync(
        "INSERT INTO expenses (category, note, amount, created_at) VALUES (?, ?, ?, ?)",
        expCategory,
        expNote.trim(),
        amount,
        new Date().toISOString(),
      );
      setExpAmount("");
      setExpNote("");
      await loadData();
      showToast("Pengeluaran dicatat");
    } catch (error) {
      console.error("Gagal menyimpan pengeluaran:", error);
      Alert.alert("Gagal menyimpan", "Pengeluaran belum berhasil dicatat.");
    } finally {
      setSavingExpense(false);
    }
  }

  function confirmDeleteExpense(expense: Expense) {
    Alert.alert(
      "Hapus pengeluaran?",
      `${expense.category} sebesar ${rupiah(expense.amount)} akan dihapus.`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Hapus",
          style: "destructive",
          onPress: async () => {
            try {
              await db.runAsync("DELETE FROM expenses WHERE id = ?", expense.id);
              await loadData();
              showToast("Pengeluaran dihapus");
            } catch (error) {
              console.error("Gagal menghapus pengeluaran:", error);
              Alert.alert("Gagal menghapus", "Pengeluaran belum berhasil dihapus.");
            }
          },
        },
      ],
    );
  }

  /* ---------- Restok ---------- */

  async function saveRestock(product: Product) {
    if (!isPositiveInteger(restockQty)) {
      Alert.alert("Jumlah belum valid", "Masukkan jumlah stok masuk lebih dari 0.");
      return;
    }
    try {
      await db.runAsync(
        "UPDATE products SET stock = COALESCE(stock, 0) + ? WHERE id = ?",
        Number(restockQty),
        product.id,
      );
      setRestockId(null);
      setRestockQty("");
      await loadData();
      showToast("Stok ditambahkan");
    } catch (error) {
      console.error("Gagal menambah stok:", error);
      Alert.alert("Gagal menyimpan", "Stok belum berhasil ditambahkan.");
    }
  }

  /* ---------- Kasbon ---------- */

  function startPay(d: Debtor) {
    setPayingKey(d.key);
    setPayAmount(String(d.remaining));
    setPayVia("tunai");
  }

  async function receivePayment(d: Debtor) {
    if (savingPay) return;
    const amount = Number(payAmount);
    if (!isPositiveInteger(payAmount) || amount > d.remaining) {
      Alert.alert(
        "Nominal belum valid",
        `Masukkan nominal antara Rp1 dan ${rupiah(d.remaining)}.`,
      );
      return;
    }
    setSavingPay(true);
    try {
      await db.withTransactionAsync(async () => {
        let left = amount;
        for (const it of d.items) {
          if (left <= 0) break;
          const part = Math.min(left, it.remaining);
          await db.runAsync(
            "INSERT INTO debt_payments (sale_id, amount, method, created_at) VALUES (?, ?, ?, ?)",
            it.sale.id,
            part,
            payVia,
            new Date().toISOString(),
          );
          left -= part;
        }
      });
      setPayingKey(null);
      setPayAmount("");
      await loadData();
      showToast(amount === d.remaining ? "Kasbon lunas" : "Pembayaran dicatat");
    } catch (error) {
      console.error("Gagal menyimpan pembayaran:", error);
      Alert.alert("Gagal menyimpan", "Pembayaran belum berhasil dicatat.");
    } finally {
      setSavingPay(false);
    }
  }

  /* ---------- Target ---------- */

  function startEditTarget() {
    setTargetInput(target > 0 ? String(target) : "");
    setEditingTarget(true);
  }

  async function saveTarget() {
    if (!isPositiveInteger(targetInput)) {
      Alert.alert("Target belum valid", "Masukkan target lebih dari Rp0.");
      return;
    }
    try {
      await db.runAsync(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('monthly_target', ?)",
        targetInput,
      );
      setTarget(Number(targetInput));
      setEditingTarget(false);
      showToast("Target disimpan");
    } catch (error) {
      console.error("Gagal menyimpan target:", error);
      Alert.alert("Gagal menyimpan", "Target belum berhasil disimpan.");
    }
  }

  async function clearTarget() {
    try {
      await db.runAsync("DELETE FROM settings WHERE key = 'monthly_target'");
      setTarget(0);
      setEditingTarget(false);
      showToast("Target dihapus");
    } catch (error) {
      console.error("Gagal menghapus target:", error);
      Alert.alert("Gagal menghapus", "Target belum berhasil dihapus.");
    }
  }

  /* ---------- Laporan ---------- */

  async function shareReport() {
    const lines = [
      `Laporan Usahain.aja (${periodLabel})`,
      `Omzet: ${rupiah(revenue)}`,
      `Laba kotor: ${rupiah(grossProfit)}`,
      `Pengeluaran: ${rupiah(expenseTotal)}`,
      `Laba bersih: ${rupiah(netProfit)}`,
      `Jumlah transaksi: ${filteredSales.length}`,
    ];
    lines.push(
      `Uang masuk: tunai ${rupiah(methodRecap.tunai)}, QRIS ${rupiah(methodRecap.qris)}, transfer ${rupiah(methodRecap.transfer)}`,
    );
    if (totalReceivable > 0) {
      lines.push(`Piutang kasbon: ${rupiah(totalReceivable)}`);
    }
    if (bestSeller) {
      lines.push(`Terlaris: ${bestSeller.name} (${bestSeller.qty} terjual)`);
    }
    try {
      await Share.share({ message: lines.join("\n") });
    } catch (error) {
      console.error("Gagal membagikan laporan:", error);
    }
  }

  /* ---------- UI helpers ---------- */

  function renderField(
    label: string,
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
    numeric = false,
    currency = false,
  ) {
    return (
      <View style={styles.field} key={label}>
        <Text style={styles.label}>{label}</Text>
        <TextInput
          style={styles.input}
          value={currency ? formatInputRupiah(value) : value}
          onChangeText={(t) => onChange(currency ? parseDigits(t) : t)}
          placeholder={placeholder}
          placeholderTextColor="#A5B0A8"
          keyboardType={numeric ? "number-pad" : "default"}
          maxLength={currency ? 18 : numeric ? 12 : 100}
          autoCapitalize="sentences"
        />
      </View>
    );
  }

  function renderPeriodSelector() {
    return (
      <View style={styles.periodRow}>
        {PERIODS.map((item) => (
          <Pressable
            key={item.value}
            accessibilityRole="button"
            accessibilityState={{ selected: period === item.value }}
            onPress={() => setPeriod(item.value)}
            style={[
              styles.periodButton,
              period === item.value && styles.periodActive,
            ]}
          >
            <Text
              style={[
                styles.periodText,
                period === item.value && styles.periodTextActive,
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
    );
  }

  const tabs: {
    key: Page;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    iconOn: keyof typeof Ionicons.glyphMap;
  }[] = [
    { key: "dashboard", label: "Ringkasan", icon: "stats-chart-outline", iconOn: "stats-chart" },
    { key: "products", label: "Produk", icon: "cube-outline", iconOn: "cube" },
    { key: "sales", label: "Jual", icon: "receipt-outline", iconOn: "receipt" },
    { key: "debts", label: "Kasbon", icon: "people-outline", iconOn: "people" },
    { key: "expenses", label: "Biaya", icon: "wallet-outline", iconOn: "wallet" },
  ];

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <ActivityIndicator size="large" color={C.green} />
        <Text style={styles.muted}>Menyiapkan Usahain.aja...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.flex1}>
              <Text style={styles.greeting}>{greeting()}</Text>
              <Text style={styles.title}>Usahain.aja</Text>
            </View>
          </View>

          {/* ================= DASHBOARD ================= */}
          {page === "dashboard" && (
            <>
              {renderPeriodSelector()}

              <View style={styles.hero}>
                <View style={styles.heroTop}>
                  <Text style={styles.lightLabel}>Omzet {periodLabel}</Text>
                  {revenue > 0 && (
                    <View style={styles.marginPill}>
                      <Text style={styles.marginPillText}>
                        Margin bersih {margin}%
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.heroValue}>{rupiah(revenue)}</Text>
                <Text style={styles.heroHint}>
                  {filteredSales.length === 0
                    ? "Belum ada transaksi"
                    : `${filteredSales.length} transaksi tercatat`}
                </Text>
              </View>

              <View style={styles.statsRow}>
                <View style={styles.statCard}>
                  <Text style={styles.label}>Laba kotor</Text>
                  <Text style={styles.statValue}>{rupiah(grossProfit)}</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.label}>Pengeluaran</Text>
                  <Text style={styles.statValue}>{rupiah(expenseTotal)}</Text>
                </View>
              </View>

              <View
                style={[
                  styles.netCard,
                  netProfit < 0 && { backgroundColor: C.redSoft },
                ]}
              >
                <View style={styles.flex1}>
                  <Text style={styles.label}>Laba bersih</Text>
                  <Text
                    style={[
                      styles.netValue,
                      netProfit < 0 && { color: C.red },
                    ]}
                  >
                    {rupiah(netProfit)}
                  </Text>
                  <Text style={styles.statSub}>
                    {netProfit < 0
                      ? "Pengeluaran lebih besar dari laba kotor"
                      : "Laba kotor dikurangi pengeluaran"}
                  </Text>
                </View>
              </View>

              <View style={styles.statsRow}>
                <View style={styles.statCard}>
                  <Text style={styles.label}>Terlaris</Text>
                  <Text style={styles.statValue} numberOfLines={1}>
                    {bestSeller ? bestSeller.name : "-"}
                  </Text>
                  {bestSeller && (
                    <Text style={styles.statSub}>{bestSeller.qty} terjual</Text>
                  )}
                </View>
              </View>

              <View style={styles.actionsRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Catat penjualan"
                  style={({ pressed }) => [
                    styles.actionBtn,
                    styles.actionDark,
                    pressed && styles.pressed,
                  ]}
                  onPress={startSale}
                >
                  <Text style={styles.actionDarkText}>Catat penjualan</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Catat pengeluaran"
                  style={({ pressed }) => [
                    styles.actionBtn,
                    styles.actionOutline,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => setPage("expenses")}
                >
                  <Text
                    style={styles.actionOutlineText}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.85}
                  >
                    Catat pengeluaran
                  </Text>
                </Pressable>
              </View>

              {lowStock.length > 0 && (
                <View style={styles.alertCard}>
                  <Text style={styles.itemTitle}>Stok menipis</Text>
                  {lowStock.slice(0, 4).map((x) => (
                    <View key={x.id} style={styles.alertRow}>
                      <Text style={styles.alertName} numberOfLines={1}>
                        {x.name}
                      </Text>
                      <Text
                        style={[styles.alertValue, x.stock === 0 && { color: C.red }]}
                      >
                        {x.stock === 0 ? "Habis" : `Sisa ${x.stock}`}
                      </Text>
                    </View>
                  ))}
                  {lowStock.length > 4 && (
                    <Text style={styles.statSub}>
                      dan {lowStock.length - 4} produk lain
                    </Text>
                  )}
                  <Pressable hitSlop={8} onPress={() => setPage("products")}>
                    <Text style={[styles.link, { marginTop: 10 }]}>Kelola stok</Text>
                  </Pressable>
                </View>
              )}

              {totalReceivable > 0 && (
                <Pressable style={styles.alertCard} onPress={() => setPage("debts")}>
                  <Text style={styles.itemTitle}>Piutang kasbon</Text>
                  <Text style={styles.netValue}>{rupiah(totalReceivable)}</Text>
                  <Text style={styles.statSub}>
                    {debtors.length} pelanggan belum melunasi. Ketuk untuk melihat.
                  </Text>
                </Pressable>
              )}

              <Text style={styles.sectionTitle}>Uang masuk {periodLabel}</Text>
              <View style={[styles.card, { marginTop: 0 }]}>
                {PAY_METHODS.map((m) => (
                  <View key={m.key} style={styles.recapRow}>
                    <Text style={styles.muted}>{m.label}</Text>
                    <Text style={styles.itemTitle}>{rupiah(methodRecap[m.key])}</Text>
                  </View>
                ))}
                <View style={[styles.recapRow, styles.recapTotal]}>
                  <Text style={styles.itemTitle}>Total uang masuk</Text>
                  <Text style={styles.netValue}>{rupiah(cashIn)}</Text>
                </View>
                {methodRecap.kasbon > 0 && (
                  <View style={styles.recapRow}>
                    <Text style={styles.muted}>Kasbon baru (belum dibayar)</Text>
                    <Text style={styles.itemTitle}>{rupiah(methodRecap.kasbon)}</Text>
                  </View>
                )}
                <Text style={styles.helper}>
                  Sudah termasuk pelunasan kasbon. Cocokkan dengan uang di laci dan
                  mutasi rekening atau QRIS.
                </Text>
              </View>

              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, styles.noMargin]}>
                  Target bulan ini
                </Text>
                {target > 0 && !editingTarget && (
                  <Pressable hitSlop={8} onPress={startEditTarget}>
                    <Text style={styles.link}>Ubah</Text>
                  </Pressable>
                )}
              </View>
              <View style={[styles.card, { marginTop: 0 }]}>
                {editingTarget ? (
                  <>
                    {renderField(
                      "Target laba bersih per bulan",
                      targetInput,
                      setTargetInput,
                      "Rp5.000.000",
                      true,
                      true,
                    )}
                    <Pressable style={styles.primary} onPress={saveTarget}>
                      <Text style={styles.primaryText}>Simpan target</Text>
                    </Pressable>
                    <Pressable
                      style={styles.ghost}
                      onPress={() => setEditingTarget(false)}
                    >
                      <Text style={styles.ghostText}>Batal</Text>
                    </Pressable>
                    {target > 0 && (
                      <Pressable style={styles.ghost} onPress={clearTarget}>
                        <Text style={[styles.ghostText, { color: C.red }]}>
                          Hapus target
                        </Text>
                      </Pressable>
                    )}
                  </>
                ) : target === 0 ? (
                  <>
                    <Text style={styles.itemTitle}>Belum ada target</Text>
                    <Text style={styles.muted}>
                      Tentukan target laba bersih bulanan, lalu pantau
                      progresnya dan berapa penjualan yang masih dibutuhkan.
                    </Text>
                    <Pressable style={styles.primary} onPress={startEditTarget}>
                      <Text style={styles.primaryText}>Atur target</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <View style={styles.targetTop}>
                      <Text style={styles.netValue}>{rupiah(monthStats.net)}</Text>
                      <Text style={styles.muted}>dari {rupiah(target)}</Text>
                    </View>
                    <View style={styles.track}>
                      <View
                        style={[
                          styles.fillGreen,
                          { width: `${Math.max(targetPct, 2)}%` },
                        ]}
                      />
                    </View>
                    <Text style={styles.statSub}>
                      {targetPct}% tercapai, sisa {monthStats.daysLeft} hari
                    </Text>
                    <Text style={[styles.muted, { marginTop: 10 }]}>
                      {remainingTarget > 0
                        ? `Butuh laba bersih ${rupiah(remainingTarget)} lagi${
                            unitsNeeded ? `, sekitar ${unitsNeeded} unit terjual` : ""
                          }. Setara ${rupiah(
                            Math.ceil(remainingTarget / monthStats.daysLeft),
                          )} per hari.`
                        : "Target bulan ini sudah tercapai."}
                    </Text>
                  </>
                )}

                {!editingTarget && monthStats.exp > 0 && (
                  <View style={styles.breakEven}>
                    <Text style={styles.itemTitle}>Titik impas bulan ini</Text>
                    <Text style={styles.muted}>
                      {breakEvenGap > 0
                        ? `Belum impas. Laba kotor masih kurang ${rupiah(
                            breakEvenGap,
                          )}${
                            breakEvenUnits ? ` (sekitar ${breakEvenUnits} unit)` : ""
                          } untuk menutup pengeluaran.`
                        : "Sudah impas. Laba kotor sudah menutup seluruh pengeluaran bulan ini."}
                    </Text>
                  </View>
                )}
              </View>

              <Text style={styles.sectionTitle}>Insight bisnis</Text>
              {insights.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>Insight belum tersedia</Text>
                  <Text style={styles.emptyText}>
                    Catat penjualan secara rutin selama beberapa hari. Analisis
                    tren dan produk terlaris akan muncul di sini.
                  </Text>
                </View>
              ) : (
                <View style={styles.listCard}>
                  {insights.map((item, i) => (
                    <View
                      key={item.text}
                      style={[
                        styles.insightRow,
                        i < insights.length - 1 && styles.rowDivider,
                      ]}
                    >
                      <View
                        style={[
                          styles.insightBar,
                          item.tone === "good" && { backgroundColor: C.green },
                          item.tone === "warn" && { backgroundColor: C.gold },
                          item.tone === "info" && { backgroundColor: "#B7C3BA" },
                        ]}
                      />
                      <Text style={styles.insightText}>{item.text}</Text>
                    </View>
                  ))}
                </View>
              )}

              <Text style={styles.sectionTitle}>Omzet 7 hari terakhir</Text>
              <View style={styles.chartCard}>
                <View style={styles.chartRow}>
                  {week.map((d) => {
                    const h = d.value > 0 ? Math.max(6, (d.value / weekMax) * 96) : 3;
                    return (
                      <View key={d.key} style={styles.chartCol}>
                        <Text style={styles.chartValue}>
                          {shortRupiah(d.value)}
                        </Text>
                        <View
                          style={[
                            styles.chartBar,
                            { height: h },
                            d.today && styles.chartBarToday,
                            d.value === 0 && styles.chartBarEmpty,
                          ]}
                        />
                        <Text
                          style={[
                            styles.chartLabel,
                            d.today && styles.chartLabelToday,
                          ]}
                        >
                          {d.label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>

              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, styles.noMargin]}>
                  Penjualan terbaru
                </Text>
                <Pressable hitSlop={8} onPress={shareReport}>
                  <Text style={styles.link}>Bagikan laporan</Text>
                </Pressable>
              </View>

              {filteredSales.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>
                    Belum ada penjualan {periodLabel}
                  </Text>
                  <Text style={styles.emptyText}>
                    {products.length === 0
                      ? "Mulai dengan menambahkan produk pertamamu."
                      : "Catat penjualan pertamamu untuk melihat ringkasan bisnis."}
                  </Text>
                  <Pressable
                    style={styles.emptyButton}
                    onPress={
                      products.length === 0 ? () => setPage("products") : startSale
                    }
                  >
                    <Text style={styles.emptyButtonText}>
                      {products.length === 0 ? "Tambah produk" : "Catat penjualan"}
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.listCard}>
                  {filteredSales.slice(0, 10).map((sale, i, arr) => (
                    <View
                      style={[styles.row, i < arr.length - 1 && styles.rowDivider]}
                      key={sale.id}
                    >
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>
                          {sale.product_name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.flex1}>
                        <Text style={styles.itemTitle} numberOfLines={1}>
                          {sale.product_name}
                        </Text>
                        <Text style={styles.muted}>
                          {sale.quantity} × {rupiah(sale.unit_price)}
                        </Text>
                        <Text style={styles.mutedSmall}>
                          {friendlyTime(sale.created_at)}, {METHOD_LABEL[sale.payment_method] ?? "Tunai"}
                          {sale.payment_method === "kasbon" ? ` (${sale.customer})` : ""}
                        </Text>
                      </View>
                      <View style={styles.rightCol}>
                        <Text style={styles.amount}>
                          {rupiah(sale.quantity * sale.unit_price)}
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Batalkan transaksi ${sale.product_name}`}
                          hitSlop={10}
                          onPress={() => confirmDeleteSale(sale)}
                        >
                          <Text style={styles.deleteText}>Batalkan</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}

          {/* ================= PRODUK ================= */}
          {page === "products" && (
            <>
              <Text style={styles.sectionTitle}>
                {editingId !== null ? "Edit produk" : "Tambah produk"}
              </Text>

              <View style={styles.card}>
                {renderField(
                  "Nama produk",
                  productName,
                  setProductName,
                  "Contoh: Kopi susu",
                )}
                {renderField(
                  "Harga jual per unit",
                  price,
                  setPrice,
                  "Rp15.000",
                  true,
                  true,
                )}
                {renderField("HPP per unit", cost, setCost, "Rp8.000", true, true)}
                {renderField(
                  editingId !== null ? "Stok saat ini" : "Stok awal (opsional)",
                  stockInput,
                  setStockInput,
                  "Kosongkan jika stok tidak dilacak",
                  true,
                )}
                {stockInput !== "" &&
                  renderField(
                    "Ingatkan jika stok tinggal",
                    minStockInput,
                    setMinStockInput,
                    "5",
                    true,
                  )}

                <Text style={styles.helper}>
                  HPP adalah biaya langsung untuk membuat satu unit produk,
                  misalnya bahan baku dan kemasan.
                  {editingId !== null
                    ? " Perubahan harga hanya berlaku untuk penjualan berikutnya."
                    : ""}
                </Text>

                {formPrice > 0 && cost !== "" && (
                  <View
                    style={[
                      styles.preview,
                      formProfit < 0 && { backgroundColor: C.redSoft },
                    ]}
                  >
                    <Text style={styles.previewLabel}>Laba per unit</Text>
                    <Text
                      style={[
                        styles.previewValue,
                        formProfit < 0 && { color: C.red },
                      ]}
                    >
                      {rupiah(formProfit)} ({formMargin}%)
                    </Text>
                  </View>
                )}

                <Pressable
                  accessibilityRole="button"
                  disabled={savingProduct}
                  style={[styles.primary, savingProduct && styles.disabledButton]}
                  onPress={saveProduct}
                >
                  <Text style={styles.primaryText}>
                    {savingProduct
                      ? "Menyimpan..."
                      : editingId !== null
                        ? "Simpan perubahan"
                        : "Simpan produk"}
                  </Text>
                </Pressable>

                {editingId !== null && (
                  <Pressable style={styles.ghost} onPress={resetProductForm}>
                    <Text style={styles.ghostText}>Batal edit</Text>
                  </Pressable>
                )}
              </View>

              <Text style={styles.sectionTitle}>
                Katalog produk ({products.length})
              </Text>

              {products.length > 3 && (
                <TextInput
                  style={[styles.input, styles.search]}
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Cari produk"
                  placeholderTextColor="#A5B0A8"
                />
              )}

              {products.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>Katalog masih kosong</Text>
                  <Text style={styles.emptyText}>
                    Isi form di atas untuk menambahkan produk pertamamu.
                  </Text>
                </View>
              ) : visibleProducts.length === 0 ? (
                <Text style={styles.emptyText}>
                  Tidak ada produk dengan nama "{search}".
                </Text>
              ) : (
                <View style={styles.listCard}>
                  {visibleProducts.map((product, i, arr) => {
                    const m = Math.round(
                      ((product.unit_price - product.unit_cost) /
                        product.unit_price) *
                        100,
                    );
                    return (
                      <View
                        style={[
                          styles.productItem,
                          i < arr.length - 1 && styles.rowDivider,
                          editingId === product.id && { backgroundColor: C.goldSoft },
                        ]}
                        key={product.id}
                      >
                        <View style={styles.productTop}>
                          <View style={styles.avatar}>
                            <Text style={styles.avatarText}>
                              {product.name.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <View style={styles.flex1}>
                            <Text style={styles.itemTitle} numberOfLines={1}>
                              {product.name}
                            </Text>
                            <Text style={styles.muted}>
                              HPP {rupiah(product.unit_cost)}
                            </Text>
                            <Text
                              style={[styles.mutedSmall, m < 0 && { color: C.red }]}
                            >
                              Margin {m}%
                            </Text>
                            {product.stock !== null && (
                              <Text
                                style={[
                                  styles.mutedSmall,
                                  product.stock <= product.min_stock && {
                                    color: C.red,
                                    fontWeight: "700",
                                  },
                                ]}
                              >
                                {product.stock === 0
                                  ? "Stok habis"
                                  : `Stok ${product.stock}${
                                      product.stock <= product.min_stock ? " (menipis)" : ""
                                    }`}
                              </Text>
                            )}
                          </View>
                          <Text style={styles.amount}>
                            {rupiah(product.unit_price)}
                          </Text>
                        </View>
                        <View style={styles.productActions}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Edit ${product.name}`}
                            style={styles.editBtn}
                            onPress={() => startEdit(product)}
                          >
                            <Text style={styles.editBtnText}>
                              {editingId === product.id ? "Sedang diedit" : "Edit"}
                            </Text>
                          </Pressable>
                          {product.stock !== null && (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Tambah stok ${product.name}`}
                              style={styles.restockBtn}
                              onPress={() => {
                                setRestockId(restockId === product.id ? null : product.id);
                                setRestockQty("");
                              }}
                            >
                              <Text style={styles.restockBtnText}>Restok</Text>
                            </Pressable>
                          )}
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Hapus ${product.name}`}
                            style={styles.deleteBtn}
                            onPress={() => confirmDeleteProduct(product)}
                          >
                            <Text style={styles.deleteBtnText}>Hapus</Text>
                          </Pressable>
                        </View>
                        {restockId === product.id && (
                          <View style={styles.restockRow}>
                            <TextInput
                              style={[styles.input, styles.flex1]}
                              value={restockQty}
                              onChangeText={(t) => setRestockQty(parseDigits(t))}
                              placeholder="Jumlah stok masuk"
                              placeholderTextColor="#A5B0A8"
                              keyboardType="number-pad"
                              maxLength={9}
                            />
                            <Pressable
                              style={styles.restockSave}
                              onPress={() => saveRestock(product)}
                            >
                              <Text style={styles.primaryText}>Tambah</Text>
                            </Pressable>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </>
          )}

          {/* ================= PENJUALAN ================= */}
          {page === "sales" && (
            <>
              <Text style={styles.sectionTitle}>Catat penjualan</Text>
              <Text style={styles.subtitle}>
                Pilih produk yang terjual. Harga dan HPP disimpan sesuai nilai
                saat transaksi dicatat.
              </Text>

              {products.length === 0 ? (
                <View style={[styles.emptyCard, { marginTop: 16 }]}>
                  <Text style={styles.emptyTitle}>Katalog produk masih kosong</Text>
                  <Text style={styles.emptyText}>
                    Tambahkan produk terlebih dahulu sebelum mencatat penjualan.
                  </Text>
                  <Pressable
                    style={styles.emptyButton}
                    onPress={() => setPage("products")}
                  >
                    <Text style={styles.emptyButtonText}>Tambah produk</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <View style={{ marginTop: 14 }}>
                    {products.map((product) => {
                      const on = selectedId === product.id;
                      return (
                        <Pressable
                          key={product.id}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          onPress={() => {
                            if (product.stock !== null && product.stock <= 0) {
                              Alert.alert(
                                "Stok habis",
                                `${product.name} sedang kosong. Tambahkan stok di tab Produk.`,
                              );
                              return;
                            }
                            setSelectedId(product.id);
                            setQuantity("1");
                          }}
                          style={[
                            styles.productOption,
                            on && styles.productSelected,
                            product.stock !== null && product.stock <= 0 && { opacity: 0.5 },
                          ]}
                        >
                          <View style={[styles.radio, on && styles.radioOn]}>
                            {on && <Text style={styles.radioTick}>✓</Text>}
                          </View>
                          <View style={styles.flex1}>
                            <Text style={styles.itemTitle} numberOfLines={1}>
                              {product.name}
                            </Text>
                            <Text style={styles.muted}>
                              HPP {rupiah(product.unit_cost)}
                            </Text>
                            {product.stock !== null && (
                              <Text
                                style={[
                                  styles.mutedSmall,
                                  product.stock <= product.min_stock && { color: C.red },
                                ]}
                              >
                                {product.stock === 0 ? "Stok habis" : `Stok ${product.stock}`}
                              </Text>
                            )}
                          </View>
                          <Text style={styles.amount}>
                            {rupiah(product.unit_price)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {selectedProduct && (
                    <View style={styles.card}>
                      <Text style={styles.itemTitle}>{selectedProduct.name}</Text>
                      {selectedProduct.stock !== null && (
                        <Text style={styles.mutedSmall}>
                          Stok tersedia {selectedProduct.stock}
                        </Text>
                      )}

                      <Text style={[styles.label, { marginTop: 14 }]}>
                        Jumlah terjual
                      </Text>
                      <View style={styles.stepper}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Kurangi jumlah"
                          style={styles.stepBtn}
                          onPress={() => changeQty(-1)}
                        >
                          <Text style={styles.stepText}>−</Text>
                        </Pressable>
                        <TextInput
                          style={styles.qtyInput}
                          value={quantity}
                          onChangeText={(t) => setQuantity(parseDigits(t))}
                          keyboardType="number-pad"
                          maxLength={9}
                          textAlign="center"
                        />
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Tambah jumlah"
                          style={styles.stepBtn}
                          onPress={() => changeQty(1)}
                        >
                          <Text style={styles.stepText}>+</Text>
                        </Pressable>
                      </View>

                      <View style={styles.quickRow}>
                        {[5, 10, 20].map((n) => (
                          <Pressable
                            key={n}
                            style={styles.quickChip}
                            onPress={() => changeQty(n)}
                          >
                            <Text style={styles.quickText}>+{n}</Text>
                          </Pressable>
                        ))}
                      </View>

                      <Text style={[styles.label, { marginTop: 16 }]}>
                        Metode pembayaran
                      </Text>
                      <View style={styles.chipWrap}>
                        {METHODS.map((m) => {
                          const on = payMethod === m.key;
                          return (
                            <Pressable
                              key={m.key}
                              accessibilityRole="button"
                              accessibilityState={{ selected: on }}
                              onPress={() => setPayMethod(m.key)}
                              style={[styles.catChip, on && styles.catChipOn]}
                            >
                              <Text style={[styles.catText, on && styles.catTextOn]}>
                                {m.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                      {payMethod === "kasbon" && (
                        <>
                          {renderField(
                            "Nama pelanggan",
                            customerName,
                            setCustomerName,
                            "Contoh: Bu Sari",
                          )}
                          <Text style={styles.helper}>
                            Kasbon dicatat sebagai omzet. Tagihannya muncul di tab
                            Kasbon sampai dilunasi.
                          </Text>
                        </>
                      )}

                      <View style={styles.summary}>
                        <View style={styles.summaryRow}>
                          <Text style={styles.muted}>Total omzet</Text>
                          <Text style={styles.statValue}>
                            {rupiah(
                              (Number(quantity) || 0) * selectedProduct.unit_price,
                            )}
                          </Text>
                        </View>
                        <View style={styles.summaryRow}>
                          <Text style={styles.muted}>Estimasi laba kotor</Text>
                          <Text style={[styles.statValue, { color: C.green }]}>
                            {rupiah(
                              (Number(quantity) || 0) *
                                (selectedProduct.unit_price -
                                  selectedProduct.unit_cost),
                            )}
                          </Text>
                        </View>
                      </View>

                      <Pressable
                        accessibilityRole="button"
                        disabled={savingSale}
                        style={[styles.primary, savingSale && styles.disabledButton]}
                        onPress={saveSale}
                      >
                        <Text style={styles.primaryText}>
                          {savingSale ? "Menyimpan..." : "Simpan penjualan"}
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </>
              )}
            </>
          )}

          {/* ================= KASBON ================= */}
          {page === "debts" && (
            <>
              <Text style={styles.sectionTitle}>Kasbon pelanggan</Text>
              <Text style={styles.subtitle}>
                Catat penjualan dengan metode Kasbon di tab Jual, lalu terima
                pembayarannya di sini sampai lunas.
              </Text>

              <View style={[styles.netCard, { marginTop: 14 }]}>
                <View style={styles.flex1}>
                  <Text style={styles.label}>Total piutang</Text>
                  <Text style={styles.netValue}>{rupiah(totalReceivable)}</Text>
                  <Text style={styles.statSub}>{debtors.length} pelanggan</Text>
                </View>
              </View>

              {debtors.length === 0 ? (
                <View style={[styles.emptyCard, { marginTop: 12 }]}>
                  <Text style={styles.emptyTitle}>Tidak ada kasbon</Text>
                  <Text style={styles.emptyText}>
                    Semua pelanggan sudah lunas, atau belum ada penjualan kasbon.
                  </Text>
                </View>
              ) : (
                debtors.map((d) => (
                  <View key={d.key} style={[styles.card, { marginTop: 12 }]}>
                    <View style={styles.debtTop}>
                      <View style={styles.flex1}>
                        <Text style={styles.itemTitle}>{d.name}</Text>
                        <Text style={styles.mutedSmall}>
                          {d.items.length} transaksi, sejak{" "}
                          {friendlyTime(d.items[0].sale.created_at)}
                        </Text>
                      </View>
                      <Text style={[styles.amount, { color: C.red }]}>
                        {rupiah(d.remaining)}
                      </Text>
                    </View>

                    {d.items.slice(0, 3).map((it) => (
                      <Text key={it.sale.id} style={styles.muted}>
                        {it.sale.quantity} × {it.sale.product_name}, sisa{" "}
                        {rupiah(it.remaining)}
                      </Text>
                    ))}
                    {d.items.length > 3 && (
                      <Text style={styles.mutedSmall}>
                        dan {d.items.length - 3} transaksi lain
                      </Text>
                    )}

                    {payingKey === d.key ? (
                      <>
                        {renderField(
                          "Nominal dibayar",
                          payAmount,
                          setPayAmount,
                          "Rp0",
                          true,
                          true,
                        )}
                        <Text style={[styles.label, { marginTop: 14 }]}>Dibayar lewat</Text>
                        <View style={styles.chipWrap}>
                          {PAY_METHODS.map((m) => {
                            const on = payVia === m.key;
                            return (
                              <Pressable
                                key={m.key}
                                accessibilityRole="button"
                                accessibilityState={{ selected: on }}
                                onPress={() => setPayVia(m.key)}
                                style={[styles.catChip, on && styles.catChipOn]}
                              >
                                <Text style={[styles.catText, on && styles.catTextOn]}>
                                  {m.label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                        <Pressable
                          disabled={savingPay}
                          style={[styles.primary, savingPay && styles.disabledButton]}
                          onPress={() => receivePayment(d)}
                        >
                          <Text style={styles.primaryText}>
                            {savingPay ? "Menyimpan..." : "Simpan pembayaran"}
                          </Text>
                        </Pressable>
                        <Pressable style={styles.ghost} onPress={() => setPayingKey(null)}>
                          <Text style={styles.ghostText}>Batal</Text>
                        </Pressable>
                      </>
                    ) : (
                      <Pressable
                        style={[styles.editBtn, { flex: 0, marginTop: 14 }]}
                        onPress={() => startPay(d)}
                      >
                        <Text style={styles.editBtnText}>Terima pembayaran</Text>
                      </Pressable>
                    )}
                  </View>
                ))
              )}
            </>
          )}

          {/* ================= PENGELUARAN ================= */}
          {page === "expenses" && (
            <>
              <Text style={styles.sectionTitle}>Catat pengeluaran</Text>
              <Text style={styles.subtitle}>
                Catat biaya operasional seperti sewa, gaji, atau listrik agar
                laba bersihmu akurat.
              </Text>

              <View style={styles.card}>
                <Text style={styles.label}>Kategori</Text>
                <View style={styles.chipWrap}>
                  {CATEGORIES.map((cat) => {
                    const on = expCategory === cat;
                    return (
                      <Pressable
                        key={cat}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        onPress={() => setExpCategory(cat)}
                        style={[styles.catChip, on && styles.catChipOn]}
                      >
                        <Text style={[styles.catText, on && styles.catTextOn]}>
                          {cat}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {renderField("Nominal", expAmount, setExpAmount, "Rp250.000", true, true)}
                {renderField(
                  "Catatan (opsional)",
                  expNote,
                  setExpNote,
                  "Contoh: Listrik bulan Oktober",
                )}

                <Pressable
                  accessibilityRole="button"
                  disabled={savingExpense}
                  style={[styles.primary, savingExpense && styles.disabledButton]}
                  onPress={saveExpense}
                >
                  <Text style={styles.primaryText}>
                    {savingExpense ? "Menyimpan..." : "Simpan pengeluaran"}
                  </Text>
                </Pressable>
              </View>

              <Text style={styles.sectionTitle}>Pengeluaran</Text>
              {renderPeriodSelector()}

              <View style={[styles.netCard, { marginTop: 14 }]}>
                <View style={styles.flex1}>
                  <Text style={styles.label}>Total {periodLabel}</Text>
                  <Text style={styles.netValue}>{rupiah(expenseTotal)}</Text>
                  <Text style={styles.statSub}>
                    {filteredExpenses.length} catatan pengeluaran
                  </Text>
                </View>
              </View>

              {expenseByCategory.length > 0 && (
                <View style={[styles.card, { marginTop: 12 }]}>
                  <Text style={styles.itemTitle}>Per kategori</Text>
                  {expenseByCategory.map(([cat, total]) => {
                    const pct = Math.round((total / expenseTotal) * 100);
                    return (
                      <View key={cat} style={styles.breakRow}>
                        <View style={styles.breakTop}>
                          <Text style={styles.muted}>{cat}</Text>
                          <Text style={styles.breakAmount}>
                            {rupiah(total)} ({pct}%)
                          </Text>
                        </View>
                        <View style={styles.track}>
                          <View style={[styles.fill, { width: `${Math.max(pct, 3)}%` }]} />
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              <View style={{ marginTop: 12 }}>
                {filteredExpenses.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <Text style={styles.emptyTitle}>
                      Belum ada pengeluaran {periodLabel}
                    </Text>
                    <Text style={styles.emptyText}>
                      Pengeluaran yang kamu catat akan muncul di sini.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.listCard}>
                    {filteredExpenses.slice(0, 20).map((e, i, arr) => (
                      <View
                        style={[styles.row, i < arr.length - 1 && styles.rowDivider]}
                        key={e.id}
                      >
                        <View style={[styles.avatar, { backgroundColor: C.redSoft }]}>
                          <Text style={[styles.avatarText, { color: C.red }]}>
                            {e.category.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.flex1}>
                          <Text style={styles.itemTitle} numberOfLines={1}>
                            {e.category}
                          </Text>
                          {e.note !== "" && (
                            <Text style={styles.muted} numberOfLines={1}>
                              {e.note}
                            </Text>
                          )}
                          <Text style={styles.mutedSmall}>
                            {friendlyTime(e.created_at)}
                          </Text>
                        </View>
                        <View style={styles.rightCol}>
                          <Text style={[styles.amount, { color: C.red }]}>
                            -{rupiah(e.amount)}
                          </Text>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Hapus pengeluaran ${e.category}`}
                            hitSlop={10}
                            onPress={() => confirmDeleteExpense(e)}
                          >
                            <Text style={styles.deleteText}>Hapus</Text>
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </>
          )}
        </ScrollView>

        <View style={styles.tabBar}>
          {tabs.map((t) => {
            const on = page === t.key;
            return (
              <Pressable
                key={t.key}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => (t.key === "sales" ? startSale() : setPage(t.key))}
                style={styles.tab}
              >
                <View style={[styles.tabDot, on && styles.tabDotOn]} />
                <Ionicons
                  name={on ? t.iconOn : t.icon}
                  size={24}
                  color={on ? C.ink : C.neutral}
                />
                <Text style={[styles.tabLabel, on && styles.tabLabelOn]}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Animated.View
          pointerEvents="none"
          style={[
            styles.toast,
            {
              opacity: toastAnim,
              transform: [
                {
                  translateY: toastAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [16, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Text style={styles.toastText}>{toast}</Text>
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const shadow = {
  borderWidth: 1,
  borderColor: C.line,
} as const;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  flex1: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center", gap: 12 },
  container: { padding: 20, paddingBottom: 24 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    marginBottom: 16,
  },
  greeting: { fontSize: 14, color: C.muted },
  title: { fontSize: 28, fontWeight: "800", color: C.ink, marginTop: 2 },
  subtitle: { fontSize: 14, color: C.muted, lineHeight: 21, marginTop: 4 },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: C.ink,
    marginTop: 24,
    marginBottom: 12,
  },
  noMargin: { marginTop: 0, marginBottom: 0 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 24,
    marginBottom: 12,
  },
  link: { color: C.green, fontSize: 13, fontWeight: "700" },

  periodRow: {
    flexDirection: "row",
    backgroundColor: "#E4EBE5",
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  periodButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 11,
  },
  periodActive: { backgroundColor: C.card, ...shadow },
  periodText: { color: C.muted, fontSize: 13, fontWeight: "600" },
  periodTextActive: { color: C.green, fontWeight: "700" },

  hero: {
    backgroundColor: C.green,
    borderRadius: 24,
    padding: 22,
    marginTop: 14,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  lightLabel: { fontSize: 13, color: "#CFE5D7" },
  marginPill: {
    backgroundColor: C.gold,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  marginPillText: { fontSize: 12, fontWeight: "800", color: "#4A3200" },
  heroValue: { fontSize: 34, color: "#fff", fontWeight: "800", marginTop: 10 },
  heroHint: { fontSize: 13, color: "#CFE5D7", marginTop: 6 },

  statsRow: { flexDirection: "row", gap: 12, marginTop: 12 },
  statCard: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 18,
    padding: 15,
    ...shadow,
  },
  statValue: { fontSize: 17, fontWeight: "800", color: C.ink },
  statSub: { fontSize: 12, color: C.muted, marginTop: 3 },

  netCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.mint,
    borderRadius: 18,
    padding: 16,
    marginTop: 12,
  },
  netValue: { fontSize: 24, fontWeight: "800", color: C.greenDark },

  actionsRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  actionBtn: {
    flex: 1,
    minHeight: 54,
    paddingHorizontal: 12,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  actionDark: { backgroundColor: C.ink },
  actionDarkText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  actionOutline: {
    backgroundColor: C.card,
    borderWidth: 1.5,
    borderColor: C.ink,
  },
  actionOutlineText: { color: C.ink, fontWeight: "700", fontSize: 14 },
  pressed: { opacity: 0.8 },

  targetTop: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  fillGreen: { height: 8, borderRadius: 4, backgroundColor: C.green },
  breakEven: {
    backgroundColor: C.bg,
    borderRadius: 14,
    padding: 14,
    marginTop: 16,
  },
  insightRow: { flexDirection: "row", gap: 12, padding: 14 },
  insightBar: { width: 4, borderRadius: 2 },
  insightText: { flex: 1, fontSize: 14, lineHeight: 21, color: C.ink },

  alertCard: {
    backgroundColor: C.card,
    borderRadius: 18,
    padding: 16,
    marginTop: 12,
    ...shadow,
  },
  alertRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  alertName: { flex: 1, fontSize: 14, color: C.ink, paddingRight: 10 },
  alertValue: { fontSize: 14, fontWeight: "700", color: "#9A6A00" },
  restockRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  restockBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: C.goldSoft,
    alignItems: "center",
  },
  restockBtnText: { color: "#7A5300", fontWeight: "700", fontSize: 14 },
  restockSave: {
    backgroundColor: C.green,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 12,
  },
  debtTop: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  recapRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  recapTotal: {
    borderTopWidth: 1,
    borderTopColor: C.line,
    marginTop: 4,
    paddingTop: 12,
  },

  chartCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 16,
    ...shadow,
  },
  chartRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    height: 150,
  },
  chartCol: { flex: 1, alignItems: "center", justifyContent: "flex-end", gap: 5 },
  chartValue: { fontSize: 10, color: C.muted, fontWeight: "600" },
  chartBar: {
    width: 22,
    borderRadius: 7,
    backgroundColor: "#8FC0A2",
  },
  chartBarToday: { backgroundColor: C.green },
  chartBarEmpty: { backgroundColor: C.line },
  chartLabel: { fontSize: 11, color: C.muted },
  chartLabelToday: { color: C.green, fontWeight: "800" },

  card: {
    backgroundColor: C.card,
    padding: 18,
    borderRadius: 20,
    marginTop: 14,
    ...shadow,
  },
  listCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    overflow: "hidden",
    ...shadow,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: C.line },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: C.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: C.green, fontWeight: "800", fontSize: 16 },
  rightCol: { alignItems: "flex-end", gap: 8 },
  inlineActions: { flexDirection: "row", gap: 14 },
  productItem: { padding: 14, gap: 12 },
  productTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  productActions: { flexDirection: "row", gap: 10 },
  editBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: C.mint,
    alignItems: "center",
  },
  editBtnText: { color: C.greenDark, fontWeight: "700", fontSize: 14 },
  deleteBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: C.redSoft,
    alignItems: "center",
  },
  deleteBtnText: { color: C.red, fontWeight: "700", fontSize: 14 },
  deleteText: { color: C.red, fontSize: 12, fontWeight: "600" },

  field: { marginTop: 14 },
  label: { fontSize: 13, color: C.muted, marginBottom: 6, fontWeight: "500" },
  input: {
    borderWidth: 1.5,
    borderColor: C.line,
    backgroundColor: "#FAFCFA",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    color: C.ink,
  },
  search: { marginBottom: 12, backgroundColor: C.card },
  helper: { fontSize: 12, color: C.muted, lineHeight: 18, marginTop: 10 },

  preview: {
    backgroundColor: C.mint,
    borderRadius: 12,
    padding: 13,
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  previewLabel: { fontSize: 13, color: C.muted },
  previewValue: { fontSize: 15, fontWeight: "800", color: C.green },

  primary: {
    backgroundColor: C.green,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 18,
  },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  disabledButton: { opacity: 0.55 },
  ghost: { alignItems: "center", paddingVertical: 12, marginTop: 4 },
  ghostText: { color: C.muted, fontWeight: "600", fontSize: 14 },

  itemTitle: { fontWeight: "700", fontSize: 15, color: C.ink },
  muted: { fontSize: 13, color: C.muted, marginTop: 3 },
  mutedSmall: { fontSize: 12, color: "#8A988F", marginTop: 2 },
  amount: { fontSize: 14, fontWeight: "800", color: C.green },

  emptyCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    ...shadow,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: C.ink,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 13,
    color: C.muted,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 6,
  },
  emptyButton: {
    backgroundColor: C.green,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginTop: 16,
  },
  emptyButtonText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  productOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: C.card,
    marginBottom: 9,
    ...shadow,
  },
  productSelected: { borderColor: C.green, backgroundColor: "#F2FAF5" },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#C5D0C8",
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: { backgroundColor: C.green, borderColor: C.green },
  radioTick: { color: "#fff", fontSize: 13, fontWeight: "800" },

  stepper: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepBtn: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: C.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: { fontSize: 24, color: C.greenDark, fontWeight: "700" },
  qtyInput: {
    flex: 1,
    height: 52,
    borderWidth: 1.5,
    borderColor: C.line,
    borderRadius: 14,
    fontSize: 22,
    fontWeight: "800",
    color: C.ink,
    backgroundColor: "#FAFCFA",
  },
  quickRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  quickChip: {
    backgroundColor: C.goldSoft,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  quickText: { color: "#7A5300", fontWeight: "700", fontSize: 13 },

  summary: {
    backgroundColor: C.bg,
    borderRadius: 14,
    padding: 14,
    marginTop: 18,
    gap: 10,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catChip: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: C.bg,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  catChipOn: { backgroundColor: C.mint, borderColor: C.green },
  catText: { color: C.muted, fontSize: 13, fontWeight: "600" },
  catTextOn: { color: C.greenDark, fontWeight: "800" },

  breakRow: { marginTop: 14 },
  breakTop: { flexDirection: "row", justifyContent: "space-between" },
  breakAmount: { fontSize: 13, color: C.ink, fontWeight: "700", marginTop: 3 },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: C.line,
    marginTop: 6,
    overflow: "hidden",
  },
  fill: { height: 8, borderRadius: 4, backgroundColor: C.red },

  tabBar: {
    flexDirection: "row",
    backgroundColor: C.card,
    paddingBottom: Platform.OS === "ios" ? 10 : 14,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  tab: { flex: 1, alignItems: "center", gap: 6, paddingBottom: 4 },
  tabDot: { width: 40, height: 4, borderRadius: 2, backgroundColor: "transparent" },
  tabDotOn: { backgroundColor: C.ink },
  tabLabel: { fontSize: 13, color: C.neutral, fontWeight: "600" },
  tabLabelOn: { color: C.ink, fontWeight: "800" },

  toast: {
    position: "absolute",
    bottom: 104,
    alignSelf: "center",
    backgroundColor: C.ink,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  toastText: { color: "#fff", fontWeight: "600", fontSize: 14 },
});