import Dexie, { Table } from 'dexie';


interface JsonFile {
    id: string;
    content: any;
  }

class MyDatabase extends Dexie {
  jsonFiles!: Table<JsonFile, string>;

  constructor() {
    super('MyDatabase');
    this.version(1).stores({
      jsonFiles: 'id, content'
    });
  }
}

const db = new MyDatabase();


export const saveToIndexedDB = async (jsonContent: any) => {
    try {
      const id = 'network_graph';
      await db.jsonFiles.put({ id, content: jsonContent });
    } catch (error) {
      console.error('Failed to save data in IndexedDB:', error);
    }
  };
  
export const loadFromIndexedDB = async () => {
    try {
      const id = 'network_graph';
      const file = await db.jsonFiles.get(id);
      return file?.content;
    } catch (error) {
      console.error('Failed to load data from IndexedDB:', error);
      return null;
    }
  };

  export const deleteFromIndexedDB = async () => {
    try {
      const id = 'network_graph';
      await db.jsonFiles.delete(id);
      console.log('Data deleted from IndexedDB');
    } catch (error) {
      console.error('Failed to delete data from IndexedDB:', error);
    }
  };