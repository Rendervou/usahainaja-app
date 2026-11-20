import { Stack } from "expo-router";
import { Suspense } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { SQLiteProvider, type SQLiteDatabase } from "expo-sqlite";

// Menambah kolom hanya jika belum ada, sehingga aman dijalankan berulang
// dan data lama tidak hilang.
async function addColumnIfMissing(
  db: SQLiteDatabase,
  table: string,
  column: string,
  definition: string,
) {
  const columns = await db.getAllAsync<{ name: string }>(
    `PRAGMA table_info(${table})`,
  );
  if (!columns.some((c) => c.name === column)) {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

async function initializeDatabase(db: SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price INTEGER NOT NULL,
      unit_cost INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      unit_price INTEGER NOT NULL,
      unit_cost INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      amount INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS debt_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      method TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Stok: NULL berarti stok produk tidak dilacak
  await addColumnIfMissing(db, "products", "stock", "stock INTEGER");
  await addColumnIfMissing(
    db,
    "products",
    "min_stock",
    "min_stock INTEGER NOT NULL DEFAULT 5",
  );

  // Metode pembayaran, pelanggan kasbon, dan relasi ke produk
  await addColumnIfMissing(
    db,
    "sales",
    "payment_method",
    "payment_method TEXT NOT NULL DEFAULT 'tunai'",
  );
  await addColumnIfMissing(
    db,
    "sales",
    "customer",
    "customer TEXT NOT NULL DEFAULT ''",
  );
  await addColumnIfMissing(db, "sales", "product_id", "product_id INTEGER");
}

function Loading() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        backgroundColor: "#F2F2F7",
      }}
    >
      <ActivityIndicator size="large" color="#1E6844" />
      <Text style={{ color: "#6C6C70" }}>Menyiapkan database...</Text>
    </View>
  );
}

export default function RootLayout() {
  return (
    <Suspense fallback={<Loading />}>
      <SQLiteProvider
        databaseName="usahainsight.db"
        onInit={initializeDatabase}
        useSuspense
      >
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#F2F2F7" },
          }}
        />
      </SQLiteProvider>
    </Suspense>
  );
}