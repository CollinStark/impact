import logging
import multiprocessing
import os
import re
from collections import defaultdict
from multiprocessing import Pool, cpu_count

multiprocessing.set_start_method("spawn", True)
from typing import List

import numpy as np
import pandas as pd
from scipy import stats

logger = logging.getLogger(__name__)

# Suppress specific warnings
pd.options.mode.chained_assignment = None  # default='warn'


def parse_chemical_formula(formula):
    element_pattern = r"([A-Z][a-z]?)(\d*)"
    element_counts = defaultdict(int)

    for element, count in re.findall(element_pattern, formula):
        if count == "":
            count = 1
        else:
            count = int(count)
        element_counts[element] += count

    return dict(element_counts)


# TODO: rename condition/timepoint
def run_mid_calculation(
    file_path,
    reference_data,
    session_dir,
    sum_thr,
    min_label,
    min_fraction,
    max_label,
    formula_trail,
    core_count: int,
    manager,
    session_id,
    ctrl_condition="Ctrl",
):

    cleaned_data = clean_data(file_path, formula_trail)

    additional_columns = [
        "id",
        "name",
        "compound_id",
        "formula",
        "compound",
        "isotopologue",
        "rt",
        "mass_isotopomer",
    ]

    exp_data_frames = []
    for index, experiment in enumerate(reference_data["experiment"].unique()):
        exp_data = reference_data[reference_data["experiment"] == experiment]

        file_names = list(exp_data["file_name"])
        matched_columns = [
            col
            for col in cleaned_data.columns
            if any(substring in col for substring in file_names)
        ]
        subset_columns = list(set(matched_columns + additional_columns))
        subset_data = cleaned_data[subset_columns]

        # Create a mapping for the condition column
        mapping = dict(zip(file_names, exp_data["condition"]))
        relative_intensities = preprocess_data(subset_data, file_names, mapping)

        with Pool(processes=core_count) as pool:
            results = pool.starmap(
                process_isotopes,
                [
                    (
                        relative_intensities[relative_intensities["id"] == id],
                        mapping,
                        sum_thr,
                        min_label,
                        min_fraction,
                        max_label,
                        ctrl_condition,
                    )
                    for id in relative_intensities["id"].unique()
                ],
            )
            # Combine the results
        combined_df = concatenate_results(results)
        combined_df["experiment"] = experiment
        exp_data_frames.append(combined_df)

        manager.send_message(
            session_id,
            f"2/3 MID Calculation: Experiment {index+1} of {len(reference_data['experiment'].unique())} Complete",
        )
        logger.info(
            f"2/3 MID Calculation: Experiment {index+1} of {len(reference_data['experiment'].unique())} Complete"
        )
    exp_data_frames = pd.concat(exp_data_frames, ignore_index=True)
    exp_data_frames.to_csv(os.path.join(session_dir, "mid.csv"), index=False)


def find_min_length(group):
    for idx in group.index[::-1]:
        if group.loc[idx, "mids"] >= 0.01:
            return len(group.loc[:idx])
    return 0


def trim_to_common_length(group, common_length):
    return group.head(common_length)


def clean_data(file_path: str, formula_trail: bool) -> pd.DataFrame:
    data = pd.read_csv(file_path)

    # Fill missing compound names by propagating the last valid observation forward
    data["compound"] = data["compound"].fillna(method="ffill")
    data["name"] = data["name"].fillna(method="ffill")
    # Fill 'compound_id' only within groups where 'name' is the same
    data["compound_id"] = data.groupby("name")["compound_id"].transform(
        lambda x: x.ffill()
    )
    data["formula"] = data["formula"].fillna(method="ffill")

    data["compound_id"] = data["compound_id"].replace(np.nan, "")

    # Remove the "Unnamed: 0" column if it exists
    if "Unnamed: 0" in data.columns:
        data.rename(columns={"Unnamed: 0": "id"}, inplace=True)
        data["id"] = data["id"].fillna(method="ffill")
        data["id"] = data["id"].astype(int)

    # Remove rows where all columns after 'isotopologue' are NaN
    data = data.dropna(how="all", subset=data.columns[5:])
    # Sort the data by 'compound' and 'isotopologue' to ensure calculations are done in order
    data = data.sort_values(by=["compound", "isotopologue"])
    # Initialize a new column for the mass isotopomers
    data["mass_isotopomer"] = np.nan

    # Get unique compounds
    unique_compounds = data["compound"].unique()

    # Calculate the mass isotopomers for each compound
    for compound in unique_compounds:
        compound_data = data[data["compound"] == compound]

        if (
            formula_trail
            and "formula" in compound_data.columns
            and not compound_data["formula"].isna().all()
        ):
            # Use the first non-null formula (assuming the same formula for each 'compound')
            formula = compound_data["formula"].dropna().iloc[0]
            element_counts = parse_chemical_formula(formula)
            c_count = element_counts.get("C", -1)  # Get the count of carbon atoms

            m0_isotopologue = compound_data["isotopologue"].min()
            for index, row in compound_data.iterrows():
                mz_diff = row["isotopologue"] - m0_isotopologue
                mass_isotopomer = round(mz_diff / 1.003355)
                # Include zero and valid mass isotopomer values
                if mass_isotopomer <= c_count:
                    data.at[index, "mass_isotopomer"] = mass_isotopomer

        else:
            # Get the M+0 isotopologue for the compound (the smallest isotopologue value)
            m0_isotopologue = compound_data["isotopologue"].min()

            # Calculate the mass isotopomer for each isotopologue of the compound
            for index, row in compound_data.iterrows():
                mz_diff = row["isotopologue"] - m0_isotopologue

                # TODO: Make mass diff a parameter
                mass_isotopomer = round(mz_diff / 1.003355)
                data.at[index, "mass_isotopomer"] = mass_isotopomer

    data["mass_isotopomer"] = data["mass_isotopomer"].fillna(-1).astype(int)
    data = data[data["mass_isotopomer"] != -1]

    return data


def preprocess_data(
    data: pd.DataFrame, sample_cols: List[str], mapping: dict
) -> pd.DataFrame:
    # Melt the dataframe to get relative intensities
    relative_intensities = pd.melt(
        data,
        id_vars=[
            "id",
            "name",
            "compound_id",
            "formula",
            "compound",
            "rt",
            "mass_isotopomer",
        ],
        value_vars=sample_cols,
        var_name="condition",
        value_name="intensity",
    )

    # Calculate the relative intensity in a more efficient way
    sum_intensities = (
        relative_intensities.groupby(["id", "condition"], as_index=False)["intensity"]
        .sum()
        .rename(columns={"intensity": "total_intensity"})
    )
    relative_intensities = relative_intensities.merge(
        sum_intensities, on=["id", "condition"]
    )
    relative_intensities["relative_intensity"] = (
        relative_intensities["intensity"] / relative_intensities["total_intensity"]
    )

    # Add timepoint column using the mapping
    relative_intensities["timepoint"] = relative_intensities["condition"].map(mapping)

    # Calculate mean and std in one groupby operation
    stats = (
        relative_intensities.groupby(["id", "timepoint", "mass_isotopomer"])[
            "intensity"
        ]
        .agg(["mean", lambda x: np.std(x, ddof=1) / np.sqrt(x.count())])
        .rename(columns={"mean": "intensity_mean", "<lambda_0>": "intensity_se"})
    )
    relative_intensities = relative_intensities.merge(
        stats, on=["id", "timepoint", "mass_isotopomer"]
    )

    return relative_intensities


def process_isotopes(
    relative_intensities,
    mapping,
    sum_thr,
    min_label,
    min_fraction,
    max_label,
    ctrl_condition="Ctrl",
):

    actual_mids = relative_intensities["mass_isotopomer"].unique()
    max_mid_index = max(actual_mids)
    actual_mids_dict = {index: True for index in actual_mids}

    new_isotopomers_data = []
    for index in range(int(max_mid_index) + 1):
        if index not in actual_mids_dict:
            for key, value in mapping.items():
                new_entry = {
                    "id": relative_intensities["id"].unique()[0],
                    "name": relative_intensities["name"].unique()[0],
                    "compound_id": relative_intensities["compound_id"].unique()[0],
                    "formula": relative_intensities["formula"].unique()[0],
                    "compound": relative_intensities["compound"].unique()[0],
                    "rt": relative_intensities["rt"].unique()[0],
                    "mass_isotopomer": index,
                    "relative_intensity": 0,
                    "intensity": 0,
                    "intensity_mean": 0,
                    "intensity_se": 0,
                    "condition": key,
                    "timepoint": value,
                }
                new_isotopomers_data.append(new_entry)
    # If we have any new isotopomers data, we need to append it to relative_intensities
    if new_isotopomers_data:
        relative_intensities = pd.concat(
            [relative_intensities, pd.DataFrame(new_isotopomers_data)],
            ignore_index=True,
        )
    relative_intensities["rt"] = relative_intensities["rt"].unique()[0]
    # Sort relative_intensities by the 'order' column
    relative_intensities = relative_intensities.sort_values("mass_isotopomer")

    unlabeled = relative_intensities[
        relative_intensities["timepoint"].str.contains(ctrl_condition)
    ]
    labeled = relative_intensities[
        ~relative_intensities["timepoint"].str.contains(ctrl_condition)
    ]

    # Count the number of DataFrames without NaN values in 'relative_intensity'
    total_conditions = unlabeled["condition"].unique().size
    conditions_without_nan = 0
    ul_samples = []
    for condition in unlabeled["condition"].unique():
        condition_df = unlabeled[unlabeled["condition"] == condition]
        if (
            not condition_df["relative_intensity"].isna().any()
            and condition_df["relative_intensity"].iloc[0] >= 1 - max_label
        ):
            conditions_without_nan += 1
            ul_samples.append(condition)

    fraction_non_nan = conditions_without_nan / total_conditions

    if fraction_non_nan < min_fraction:
        labeled = labeled.drop_duplicates(subset=["timepoint", "mass_isotopomer"])

        labeled["mids"] = np.nan
        labeled["cis"] = np.nan
        labeled["r2"] = np.nan
        labeled = labeled.drop(
            ["condition", "intensity", "total_intensity", "relative_intensity"],
            axis=1,
        )
        labeled = labeled.sort_values(by=["timepoint", "mass_isotopomer"])

        labeled = labeled.rename(columns={"compound": "mz", "timepoint": "condition"})
        return labeled

    merged_dfs = []

    for timepoint in labeled["timepoint"].unique():
        t_labeled = labeled[labeled["timepoint"] == timepoint]
        valid_conditions = []

        for condition in t_labeled["condition"].unique():
            condition_data = t_labeled[t_labeled["condition"] == condition]

            if not condition_data["relative_intensity"].isna().any():
                valid_conditions.append(condition)

        if len(valid_conditions) >= len(t_labeled["condition"].unique()) * min_fraction:
            t_labeled = pd.concat(
                [
                    t_labeled[t_labeled["condition"] == condition]
                    for condition in valid_conditions
                ]
            )
        else:
            t_labeled = t_labeled.drop_duplicates(subset=["mass_isotopomer"])

            t_labeled["mids"] = np.nan
            t_labeled["cis"] = np.nan
            t_labeled["r2"] = np.nan
            t_labeled = t_labeled.drop(
                ["condition", "intensity", "total_intensity", "relative_intensity"],
                axis=1,
            )

            merged_dfs.append(t_labeled)
            continue

        l_samples = t_labeled["condition"].unique()
        cols = len(unlabeled[unlabeled["condition"] == ul_samples[0]])
        rows = cols * len(ul_samples) * len(l_samples)

        if cols < 2 or rows < 2:
            t_labeled = t_labeled.drop_duplicates(subset=["mass_isotopomer"])

            t_labeled["mids"] = np.nan
            t_labeled["cis"] = np.nan
            t_labeled["r2"] = np.nan
            t_labeled = t_labeled.drop(
                ["condition", "intensity", "total_intensity", "relative_intensity"],
                axis=1,
            )

            merged_dfs.append(t_labeled)
            continue

        M = np.zeros((rows, cols))
        y = np.zeros(rows)
        carbon_abu = lambda intensity: intensity * (0.0107 / 0.9893)

        rc_row = 0
        for ul in ul_samples:
            ul_df = unlabeled[unlabeled["condition"] == ul]
            vec1 = ul_df["relative_intensity"].tolist()

            for l in l_samples:
                l_df = t_labeled[t_labeled["condition"] == l]
                vec2 = l_df["relative_intensity"].tolist()

                for n in range(cols):
                    for j in range(n + 1):
                        corr = (vec1[0] * carbon_abu(j)) / (
                            (vec1[1] / vec1[0]) + 1 - carbon_abu(j)
                        )
                        if n - j < len(ul_df) and j < cols:
                            if n - j == 0 and n > 0:
                                corr_value = vec1[0] + corr
                                corr_value = max(corr_value, 0)
                                M[rc_row, j] = corr_value
                            elif n - j == 1:
                                corr_value = vec1[1] - corr
                                corr_value = max(corr_value, 0)
                                M[rc_row, j] = corr_value
                            else:
                                M[rc_row, j] = vec1[n - j]

                    y[rc_row] = vec2[n]
                    rc_row += 1

        c, residuals, _, _ = np.linalg.lstsq(M, y, rcond=None)
        tss = np.sum((y - np.mean(y)) ** 2)
        r2 = 1 - residuals / tss if residuals.size > 0 else 1

        # Calculate confidence intervals
        cis = []
        if rows - cols >= 1:
            dof = len(M) - len(c)
            mse = residuals / dof
            cov = mse * np.diagonal(np.linalg.inv(M.T @ M))

            se = np.sqrt(cov)
            t = stats.t.ppf(0.9, rows - cols)
            cis = t * se

            representative_df = t_labeled.drop_duplicates(subset=["mass_isotopomer"])

            representative_df["mids"] = c
            representative_df["cis"] = cis
            representative_df["r2"] = np.repeat(r2, len(c))
            representative_df = representative_df.drop(
                ["condition", "intensity", "total_intensity", "relative_intensity"],
                axis=1,
            )

            merged_dfs.append(representative_df)
    data = pd.concat(merged_dfs)
    min_len = data.groupby("timepoint").apply(find_min_length)
    common_length = min_len.max()

    data = (
        data.groupby("timepoint")
        .apply(lambda group: trim_to_common_length(group, common_length))
        .reset_index(drop=True)
    )

    # TODO: get this from group_data labeling
    unlabeled_timepoints = ["T0"]

    sums = data.groupby("timepoint")["mids"].apply(lambda x: x.abs().sum())
    outside_threshold = (sums > 1 + sum_thr) | (sums < 1 - sum_thr)

    if outside_threshold.any():
        timepoints_to_modify = outside_threshold[outside_threshold].index

        for timepoint in timepoints_to_modify:
            data.loc[data["timepoint"] == timepoint, ["mids", "cis", "r2"]] = np.nan

    if min_label > 0:
        m0 = data[data["mass_isotopomer"] == 0]

        labeled_m0 = m0[~m0["timepoint"].isin(unlabeled_timepoints)]
        labeled_remove = labeled_m0["mids"] > (1 - min_label)

        if labeled_remove.all():
            timepoints_to_modify = labeled_m0["timepoint"].unique()

            # Iterating through these timepoints and setting the values to NaN
            for timepoint in timepoints_to_modify:
                data.loc[data["timepoint"] == timepoint, ["mids", "cis", "r2"]] = np.nan

    data = data.rename(columns={"compound": "mz", "timepoint": "condition"})
    return data


def concatenate_results(results):
    # Filter out any items that are not of type DataFrame
    dfs_to_concat = [df for df in results if isinstance(df, pd.DataFrame)]

    # Concatenate the filtered DataFrames
    combined_df = pd.concat(dfs_to_concat, ignore_index=True)
    return combined_df
