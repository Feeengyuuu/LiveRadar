/**
 * SafeStorage - iOS-compatible localStorage wrapper
 * Handles quota exceeded errors and JSON serialization
 */
const SafeStorage = {
  getItem(key, defaultValue = null) {
    try {
      const value = localStorage.getItem(key);
      return value !== null ? value : defaultValue;
    } catch (e) {
      console.warn(`[SafeStorage] 读取失败: ${key}`, e);
      return defaultValue;
    }
  },

  setItem(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      console.warn(`[SafeStorage] 写入失败: ${key}`, e);
      return false;
    }
  },

  getJSON(key, defaultValue = null) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : defaultValue;
    } catch (e) {
      console.warn(`[SafeStorage] JSON解析失败: ${key}`, e);
      return defaultValue;
    }
  },

  setJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn(`[SafeStorage] JSON存储失败: ${key}`, e);
      return false;
    }
  },

  removeItem(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      console.warn(`[SafeStorage] 删除失败: ${key}`, e);
      return false;
    }
  }
};

export { SafeStorage };
export default SafeStorage;
