export class MinHeap<T> {
    constructor(compare: (a: T, b: T) => number, capacity: number = 25) {
        this.compare = compare
        this.heap = []
        this.capacity = capacity
    }

    private capacity: number
    private heap: T[] = []
    private compare: (a: T, b: T) => number

    // Index helpers
    getParent(i: number) { return Math.floor((i - 1) / 2) }
    getLeftChild(i: number) { return 2 * i + 1 }
    getRightChild(i: number) { return 2 * i + 2 }

    private swap(i: number, j: number) {
        const temp = this.heap[i]
        this.heap[i] = this.heap[j]
        this.heap[j] = temp
    }

    peek(): T | null {
        return this.heap.length > 0 ? this.heap[0] : null
    }

    insert(item: T) {
        this.heap.push(item)
        this.heapUp(this.heap.length - 1)
        if (this.heap.length > this.capacity) {
            this.extractMin()
        }
    }

    extractMin(): T | undefined {
        if (this.heap.length === 0) return undefined
        if (this.heap.length === 1) return this.heap.pop()
        const min = this.heap[0]
        this.heap[0] = this.heap.pop()!
        this.heapDown(0)
        return min
    }

    private heapUp(index: number) {
        let currentIndex = index
        while (currentIndex > 0) {
            const parentIndex = this.getParent(currentIndex)
            if (this.compare(this.heap[currentIndex], this.heap[parentIndex]) < 0) {
                this.swap(currentIndex, parentIndex)
                currentIndex = parentIndex
            } else {
                break
            }
        }
    }

    private heapDown(index: number) {
        let currentIndex = index
        const length = this.heap.length
        while (true) {
            const left = this.getLeftChild(currentIndex)
            const right = this.getRightChild(currentIndex)
            let smallest = currentIndex
            if (left < length && this.compare(this.heap[left], this.heap[smallest]) < 0) {
                smallest = left
            }
            if (right < length && this.compare(this.heap[right], this.heap[smallest]) < 0) {
                smallest = right
            }
            if (smallest !== currentIndex) {
                this.swap(currentIndex, smallest)
                currentIndex = smallest
            } else {
                break
            }
        }
    }
}