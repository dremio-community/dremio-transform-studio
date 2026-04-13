"""
dag_utils.py — Cross-pipeline dependency graph utilities

Provides topological sort and cycle detection for pipeline execution ordering.

Usage:
    pipelines = [{"id": "a", "dependencies": ["b"]}, {"id": "b", "dependencies": []}]
    order = topological_sort(pipelines)
    # → ["b", "a"]  — b runs first, a runs after

    cycles = find_cycles(pipelines)
    # → []  — no cycles detected
"""
from __future__ import annotations
from typing import List, Optional, Dict


def build_dep_map(pipelines: List[dict]) -> Dict[str, List[str]]:
    """Build a {pipeline_id: [upstream_ids]} dict from pipeline list."""
    return {p["id"]: list(p.get("dependencies") or []) for p in pipelines}


def topological_sort(pipelines: List[dict]) -> List[str]:
    """
    Return pipeline IDs in topological order (upstream first).
    Pipelines with no dependencies come first.
    If cycles exist, they are ignored (partial order returned).

    Args:
        pipelines: list of dicts with 'id' and 'dependencies' keys

    Returns:
        Ordered list of pipeline IDs (upstream first)
    """
    dep_map = build_dep_map(pipelines)
    all_ids = set(dep_map.keys())

    # Only consider deps that exist in the current set
    graph: Dict[str, List[str]] = {
        pid: [d for d in deps if d in all_ids]
        for pid, deps in dep_map.items()
    }

    # Kahn's algorithm
    in_degree: Dict[str, int] = {pid: 0 for pid in all_ids}
    for pid, deps in graph.items():
        for dep in deps:
            in_degree[pid] = in_degree.get(pid, 0) + 1

    # Re-count properly
    in_degree = {pid: 0 for pid in all_ids}
    for pid, deps in graph.items():
        for dep in deps:
            # dep is upstream of pid — pid's in_degree++
            in_degree[pid] = in_degree[pid] + 1

    # Start with nodes that have no upstream deps
    queue = sorted([pid for pid, deg in in_degree.items() if deg == 0])
    result: List[str] = []

    # Build reverse map: dep → downstream nodes
    rev_graph: Dict[str, List[str]] = {pid: [] for pid in all_ids}
    for pid, deps in graph.items():
        for dep in deps:
            rev_graph[dep].append(pid)

    while queue:
        node = queue.pop(0)
        result.append(node)
        for downstream in sorted(rev_graph.get(node, [])):
            in_degree[downstream] -= 1
            if in_degree[downstream] == 0:
                queue.append(downstream)

    # Any remaining nodes (not in result) are part of cycles — append them at end
    remaining = [pid for pid in all_ids if pid not in result]
    result.extend(sorted(remaining))

    return result


def find_cycles(pipelines: List[dict]) -> List[List[str]]:
    """
    Detect cycles in the dependency graph using DFS.

    Returns:
        List of cycles, each cycle is a list of pipeline IDs forming the loop.
        Empty list if no cycles.
    """
    dep_map = build_dep_map(pipelines)
    all_ids = set(dep_map.keys())

    # Build adjacency: pid → downstream nodes
    rev_graph: Dict[str, List[str]] = {pid: [] for pid in all_ids}
    for pid, deps in dep_map.items():
        for dep in deps:
            if dep in all_ids:
                rev_graph[dep].append(pid)

    visited = set()
    in_stack = set()
    cycles: List[List[str]] = []

    def dfs(node: str, path: List[str]):
        visited.add(node)
        in_stack.add(node)
        path.append(node)

        for neighbor in rev_graph.get(node, []):
            if neighbor not in visited:
                dfs(neighbor, path)
            elif neighbor in in_stack:
                # Found a cycle — extract it
                cycle_start = path.index(neighbor)
                cycles.append(path[cycle_start:])

        path.pop()
        in_stack.discard(node)

    for pid in sorted(all_ids):
        if pid not in visited:
            dfs(pid, [])

    return cycles


def get_run_order_for_pipeline(
    target_id: str,
    pipelines: List[dict],
) -> List[str]:
    """
    Get the ordered list of pipeline IDs that must run before target_id,
    including target_id itself at the end.

    Args:
        target_id: the pipeline we want to execute
        pipelines: all available pipelines

    Returns:
        Ordered list of pipeline IDs to run (upstream first, target last)
    """
    dep_map = build_dep_map(pipelines)
    all_ids = {p["id"]: p for p in pipelines}

    # Walk upstream deps recursively
    def collect_deps(pid: str, seen: set) -> List[str]:
        if pid in seen:
            return []
        seen.add(pid)
        result = []
        for dep in dep_map.get(pid, []):
            if dep in all_ids:
                result.extend(collect_deps(dep, seen))
        result.append(pid)
        return result

    return collect_deps(target_id, set())


def compute_parallel_levels(pipelines: List[dict]) -> List[List[str]]:
    """
    Compute execution levels for parallel scheduling.

    Returns a list of lists, where each inner list contains pipeline IDs
    that can safely run in parallel (no dependencies between them within
    the same level). The outer list is ordered — level 0 runs first.

    Example:
        A has no deps, B depends on A, C depends on A, D depends on B and C
        → [[A], [B, C], [D]]
        B and C run in parallel after A finishes; D starts after both complete.

    Args:
        pipelines: list of dicts with 'id' and 'dependencies' keys

    Returns:
        List of parallel execution levels (each level is a sorted list of IDs)
    """
    dep_map = build_dep_map(pipelines)
    all_ids = set(dep_map.keys())

    graph: Dict[str, List[str]] = {
        pid: [d for d in deps if d in all_ids]
        for pid, deps in dep_map.items()
    }

    in_degree: Dict[str, int] = {pid: 0 for pid in all_ids}
    for pid, deps in graph.items():
        for _ in deps:
            in_degree[pid] += 1

    rev_graph: Dict[str, List[str]] = {pid: [] for pid in all_ids}
    for pid, deps in graph.items():
        for dep in deps:
            rev_graph[dep].append(pid)

    levels: List[List[str]] = []
    current_level = sorted(pid for pid, deg in in_degree.items() if deg == 0)

    visited: set = set()
    while current_level:
        levels.append(current_level)
        visited.update(current_level)
        next_level: List[str] = []
        for node in current_level:
            for downstream in rev_graph.get(node, []):
                in_degree[downstream] -= 1
                if in_degree[downstream] == 0 and downstream not in visited:
                    next_level.append(downstream)
        current_level = sorted(next_level)

    # Nodes caught in cycles end up with in_degree > 0 — append as final level
    remaining = sorted(pid for pid in all_ids if pid not in visited)
    if remaining:
        levels.append(remaining)

    return levels


def build_dag_response(pipelines: List[dict]) -> dict:
    """
    Build the full DAG response for the /api/dag endpoint.

    Returns:
        {
          "nodes": pipeline nodes with id, name, output_mode, output_table, dependencies
          "edges": pipeline-to-pipeline dependency edges
          "lineage_nodes": source + pipeline + output table nodes for data lineage view
          "lineage_edges": full data-flow edges (source_table → pipeline → output_table)
          "cycles": detected dependency cycles
          "execution_order": topological execution order
          "parallel_levels": list-of-lists for parallel scheduling
        }
    """
    nodes = [
        {
            "id": p["id"],
            "name": p.get("name", ""),
            "output_mode": p.get("output_mode", "preview"),
            "output_table": p.get("output_table"),
            "source_table": p.get("source_table"),
            "dependencies": list(p.get("dependencies") or []),
        }
        for p in pipelines
    ]

    edges = []
    for p in pipelines:
        for dep in (p.get("dependencies") or []):
            edges.append({"source": dep, "target": p["id"]})

    # ── Data Lineage graph ─────────────────────────────────────────────────────
    # Nodes: source tables (type=source), pipeline nodes (type=pipeline), output tables (type=output)
    lineage_nodes: List[dict] = []
    lineage_edges: List[dict] = []
    seen_tables: set = set()

    for p in pipelines:
        pid = p["id"]
        src = p.get("source_table")
        out = p.get("output_table")

        # Pipeline node
        lineage_nodes.append({
            "id": f"pipeline:{pid}",
            "type": "pipeline",
            "label": p.get("name", pid),
            "pipeline_id": pid,
            "output_mode": p.get("output_mode", "preview"),
        })

        # Source table node
        if src and src not in seen_tables:
            seen_tables.add(src)
            lineage_nodes.append({"id": f"table:{src}", "type": "source", "label": src})
        if src:
            lineage_edges.append({"source": f"table:{src}", "target": f"pipeline:{pid}"})

        # Output table node
        if out and out not in seen_tables:
            seen_tables.add(out)
            lineage_nodes.append({"id": f"table:{out}", "type": "output", "label": out})
        if out:
            lineage_edges.append({"source": f"pipeline:{pid}", "target": f"table:{out}"})

    # If pipeline A's output = pipeline B's source, promote that table to "intermediate"
    output_tables = {p.get("output_table") for p in pipelines if p.get("output_table")}
    source_tables = {p.get("source_table") for p in pipelines if p.get("source_table")}
    for node in lineage_nodes:
        tbl = node.get("label")
        if node["type"] == "source" and tbl in output_tables:
            node["type"] = "intermediate"
        elif node["type"] == "output" and tbl in source_tables:
            node["type"] = "intermediate"

    cycles = find_cycles(pipelines)
    execution_order = topological_sort(pipelines)
    parallel_levels = compute_parallel_levels(pipelines)

    return {
        "nodes": nodes,
        "edges": edges,
        "lineage_nodes": lineage_nodes,
        "lineage_edges": lineage_edges,
        "cycles": cycles,
        "execution_order": execution_order,
        "parallel_levels": parallel_levels,
    }
