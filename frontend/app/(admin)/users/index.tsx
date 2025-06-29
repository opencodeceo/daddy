import React, { useState, useEffect, useCallback, useRef } from "react";
import { useFocusEffect } from "@react-navigation/native"; // Added to refresh on focus
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
  RefreshControl,
  Platform,
  Keyboard,
  KeyboardAvoidingView,
  Animated,
} from "react-native";
import { useRouter } from "expo-router";
import { getUsers, deleteUser } from "../../../services/api";
import { User } from "../../../contexts/AuthContext";

interface PaginatedUsersResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: User[];
}

export default function AdminUsersScreen() {
  const router = useRouter();
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const searchBarPosition = useRef(new Animated.Value(0)).current;

  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | number | null>(
    null
  );

  // Keyboard listeners for smooth animation
  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      "keyboardDidShow",
      (event) => {
        const keyboardHeight = event.endCoordinates.height;
        setKeyboardHeight(keyboardHeight);

        // Animate search bar up when keyboard appears
        Animated.timing(searchBarPosition, {
          toValue: -keyboardHeight + (Platform.OS === "ios" ? 34 : 0), // Account for safe area on iOS
          duration: 250,
          useNativeDriver: false,
        }).start();
      }
    );

    const keyboardDidHideListener = Keyboard.addListener(
      "keyboardDidHide",
      () => {
        setKeyboardHeight(0);

        // Animate search bar back to bottom
        Animated.timing(searchBarPosition, {
          toValue: 0,
          duration: 250,
          useNativeDriver: false,
        }).start();
      }
    );

    return () => {
      keyboardDidShowListener?.remove();
      keyboardDidHideListener?.remove();
    };
  }, [searchBarPosition]);

  const fetchUsers = useCallback(async (reset: boolean = false) => {
    try {
      if (reset) {
        setIsLoading(true);
        setError(null);
      }

      // Filter to get only Salespersons
      const response = (await getUsers({
        role: "Salesperson",
      })) as PaginatedUsersResponse;

      setUsers(response.results || response);
    } catch (err: any) {
      console.error("Failed to fetch users:", err);
      setError(err.message || "Failed to fetch users");
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Refresh users list when screen is focused
  useFocusEffect(
    useCallback(() => {
      fetchUsers(true);
    }, [fetchUsers])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    fetchUsers(true);
  };

  const handleDeleteUser = (userId: string | number, userName: string) => {
    Alert.alert(
      "Confirm Delete",
      `Are you sure you want to delete the user "${userName}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeletingUserId(userId);
            try {
              await deleteUser(userId);
              // Optimistically remove user from local state
              setUsers((prevUsers) =>
                prevUsers.filter((user) => user.id !== userId)
              );
              Alert.alert("Success", "User deleted successfully.");
            } catch (err: any) {
              console.error("Delete user error:", err);
              Alert.alert(
                "Error",
                err.response?.data?.detail ||
                  err.message ||
                  "Failed to delete user."
              );
              // Refresh the list to ensure consistency
              fetchUsers(true);
            } finally {
              setDeletingUserId(null);
            }
          },
        },
      ]
    );
  };

  const filteredUsers = users.filter((user) =>
    searchQuery
      ? user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.first_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.last_name?.toLowerCase().includes(searchQuery.toLowerCase())
      : true
  );

  const renderUserItem = ({ item }: { item: User }) => (
    <View
      style={[
        styles.userItemContainer,
        deletingUserId === item.id && styles.deletingUser,
      ]}
    >
      <View style={styles.userInfo}>
        <Text style={styles.userName}>
          {item.first_name && item.last_name
            ? `${item.first_name} ${item.last_name}`
            : item.email}
        </Text>
        <Text style={styles.userEmail}>{item.email}</Text>
        <Text style={styles.userRole}>Role: {item.role}</Text>
        <Text style={styles.userStatus}>
          Status: {item.is_active ? "Active" : "Inactive"}
        </Text>
      </View>
      <View style={styles.userActions}>
        <TouchableOpacity
          style={[
            styles.actionButton,
            styles.editButton,
            deletingUserId === item.id && styles.disabledButton,
          ]}
          onPress={() => router.push(`/(admin)/users/${item.id}`)}
          disabled={deletingUserId === item.id}
        >
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        {deletingUserId === item.id ? (
          <View style={[styles.actionButton, styles.deleteButton]}>
            <ActivityIndicator size="small" color="#fff" />
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.actionButton, styles.deleteButton]}
            onPress={() =>
              handleDeleteUser(
                item.id,
                item.first_name && item.last_name
                  ? `${item.first_name} ${item.last_name}`
                  : item.email
              )
            }
          >
            <Text style={styles.actionButtonText}>Delete</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  if (isLoading && users.length === 0 && !refreshing) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading users...</Text>
      </View>
    );
  }

  if (error && users.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Error: {error}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => fetchUsers(true)}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Users List */}
      <FlatList
        data={filteredUsers}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderUserItem}
        contentContainerStyle={[
          styles.listContainer,
          filteredUsers.length === 0 ? styles.emptyListContainer : null,
          { paddingBottom: keyboardHeight > 0 ? keyboardHeight + 80 : 100 }, // Dynamic padding for floating bar
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {searchQuery
                ? "No users found matching your search."
                : "No users found."}
            </Text>
          </View>
        }
      />

      {/* Floating Bottom Bar with Search and Add Button */}
      <Animated.View
        style={[
          styles.floatingBar,
          {
            transform: [{ translateY: searchBarPosition }],
          },
        ]}
      >
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search user by name, email..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
          />
        </View>
        <TouchableOpacity
          style={styles.addFloatingButton}
          onPress={() => router.push("/(admin)/users/add")}
        >
          <Text style={styles.addFloatingButtonText}>+</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    paddingTop: 80, // Increased top margin for better spacing
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
  },
  floatingBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: Platform.OS === "ios" ? 34 : 12, // Account for safe area on iOS
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 8,
    borderTopWidth: 1,
    borderTopColor: "#e1e1e1",
  },
  searchContainer: {
    flex: 1,
    marginRight: 12,
  },
  searchInput: {
    backgroundColor: "#f8f8f8",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  addFloatingButton: {
    backgroundColor: "#007AFF",
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  addFloatingButtonText: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "bold",
  },
  listContainer: {
    padding: 16,
  },
  emptyListContainer: {
    flex: 1,
    justifyContent: "center",
  },
  userItemContainer: {
    backgroundColor: "#ffffff",
    padding: 16,
    marginBottom: 12,
    borderRadius: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  deletingUser: {
    opacity: 0.6,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333333",
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: "#666666",
    marginBottom: 2,
  },
  userRole: {
    fontSize: 14,
    color: "#888888",
    marginBottom: 2,
  },
  userStatus: {
    fontSize: 14,
    color: "#888888",
  },
  userActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    minWidth: 60,
    alignItems: "center",
  },
  disabledButton: {
    backgroundColor: "#cccccc",
  },
  editButton: {
    backgroundColor: "#34C759",
  },
  deleteButton: {
    backgroundColor: "#FF3B30",
  },
  actionButtonText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 14,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#666666",
  },
  errorText: {
    fontSize: 16,
    color: "#FF3B30",
    textAlign: "center",
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 16,
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: "#666666",
    textAlign: "center",
  },
});
