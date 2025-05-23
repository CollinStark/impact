import re
from typing import Dict, List

import numpy as np
import pandas as pd
from app.components.utils import UserInputError


def mid_calculation(
    df: pd.DataFrame, unlabeled_condition: str
) -> Dict[str, List[Dict[str, str | float | None]]]:
    """
    Collect metabolite data and calculate mass isotopomer distribution (MID) using correction matrix.

    Parameters:
        df (pd.DataFrame): The input DataFrame containing the metabolite data.
            It should have the following columns:
            - 'experiment': The experiment of the metabolite.
            - 'condition': The condition of the metabolite.
            - 'name': Name of the metabolite.
            - 'mass_isotopomer': Mass isotopomers of the metablite.
            - 'intensity': Intensity values of the metabolite.
        unlabeled_condition (str): The condition used as the unlabeled control.

    Returns:
        Dict[str, List[Dict[str, Union[str, float, None]]]]: A dictionary where each key represents a
        unique metabolite name, and the corresponding value is a list of dictionaries containing the
        timepoint, corrected value ('value'), and mass isotopomer ('isotopomer') for that metabolite.
        The dictionary has the following structure:

        {
            "Metabolite1": [
                {
                    "timepoint": "T0",
                    "value": 123.45,
                    "isotopomer": "mass_isotopomerMetabolite1"
                },
                {
                    "timepoint": "T1",
                    "value": 678.90,
                    "isotopomer": "mass_isotopomerMetabolite1"
                },
                ...
            ],
            "Metabolite2": [
                ...
            ],
            ...
        }

        Note: The values for 'timepoint' can be 'Ctrl' for control samples or None for invalid timepoints.

    Raises:
        ValueError: If the input DataFrame does not contain the expected columns.
        ZeroDivisionError: If division by zero occurs during the calculation.
        ValueError: If timepoint extraction fails due to invalid sample identifiers.
    """
    # Validate input DataFrame columns
    expected_columns = [
        "experiment",
        "condition",
        "name",
        "mass_isotopomer",
        "intensity",
    ]
    if not set(expected_columns).issubset(df.columns):
        raise ValueError(
            f"The input DataFrame should contain all of the following columns: {expected_columns}"
        )

    # Define a function to calculate carbon abundance based on intensity
    carbon_abu = lambda intensity: intensity * (0.0107 / 0.9893)

    # Collect dataframes for each metabolite in a dictionary
    metabolite_dataframes = {}

    # Loop through unique metabolites to calculate the correction matrix
    for metabolite in df["name"].unique():
        df_name = df[df["name"] == metabolite]

        for experiment in df_name["experiment"].unique():
            df_sub = df_name[df_name["experiment"] == experiment]

            # Calculate the sum of "Area" per group of ["sample", "mass_isotopomer"]
            df_sub["sum_area"] = df_sub.groupby(["sample", "mass_isotopomer"])[
                "Area"
            ].transform("sum")
            df_sub = df_sub.drop_duplicates(["sample", "mass_isotopomer"])

            # Calculate the sum of "sum_area" per group of "sample"
            df_sub["sum_sample_area"] = df_sub.groupby(["sample"])[
                "sum_area"
            ].transform("sum")

            # Calculate "rel_intensity" by dividing "sum_area" by "sum_sample_area" for each group of ["sample", "mass_isotopomer"]
            df_sub["rel_intensity"] = (
                df_sub.groupby(["sample", "mass_isotopomer"], as_index=False)
                .apply(lambda x: x["sum_area"] / x["sum_sample_area"])
                .reset_index(level=0, drop=True)
            )

            unlabeled = (
                df_sub[df_sub["sample"].str.contains("CONTROL")]
                .groupby("mass_isotopomer")["rel_intensity"]
                .agg(["median", "std"])
            )

            if len(unlabeled["median"]) == 0:
                unlabeled = (
                    df_sub[df_sub["sample"].str.contains("T0")]
                    .groupby("mass_isotopomer")["rel_intensity"]
                    .agg(["median", "std"])
                )

            intensity_unlabeled = unlabeled["median"]
            num_unlabeled = len(intensity_unlabeled)

            # Initialize the correction matrix with zeros and set the first column to the unlabeled intensities
            correction_matrix = np.zeros((num_unlabeled, num_unlabeled))
            correction_matrix[:, 0] = intensity_unlabeled

            # Calculate the rest of the correction matrix
            for index in range(1, num_unlabeled - 1):
                m1_corr = (intensity_unlabeled[0] * carbon_abu(index)) / (
                    (intensity_unlabeled[1] / intensity_unlabeled[0])
                    + 1
                    - carbon_abu(index)
                )
                m_a_0 = intensity_unlabeled[0] + m1_corr
                m_a_1 = intensity_unlabeled[1] - m1_corr
                intensity_new = [0] * index + [m_a_0, m_a_1]
                if index != (num_unlabeled - 2):
                    fill_rest = num_unlabeled - len(intensity_new)
                    intensity_new += list(intensity_unlabeled[2 : 2 + fill_rest])
                correction_matrix[:, index] = intensity_new

            index = num_unlabeled - 1
            m_a_0 = intensity_unlabeled[0] + (
                (intensity_unlabeled[0] * carbon_abu(index))
                / (
                    (intensity_unlabeled[1] / intensity_unlabeled[0])
                    + 1
                    - carbon_abu(index)
                )
            )
            intensity_new = [0] * index + [m_a_0]
            correction_matrix[:, index] = intensity_new

            # Calculate corrected values for each sample using the correction matrix
            df_mids = (
                df_sub[~df_sub["sample"].str.contains("CONTROL")]
                .groupby(["sample"])
                .apply(
                    lambda x: np.dot(np.linalg.inv(correction_matrix), x.rel_intensity)
                )
            )

            # Create a DataFrame from the corrected values and melt it
            df_mids = pd.DataFrame(
                df_mids.tolist(),
                columns=[f"M+{index}" for index in range(num_unlabeled)],
                index=df_mids.index,
            )
            df_mids["sample"] = df_mids.index
            df_mids = pd.melt(
                df_mids,
                value_vars=[f"M+{index}" for index in range(num_unlabeled)],
                id_vars=["sample"],
            )

            # Merge the melted DataFrame with the original DataFrame
            df_mids = pd.merge(
                df_sub,
                df_mids,
                how="left",
                right_on=["sample", "variable"],
                left_on=["sample", "mass_isotopomer"],
            )

            # Extract the timepoint from the "sample" column
            df_mids["timepoint"] = df_mids["sample"].apply(
                lambda x: (
                    "Ctrl"
                    if "CONTROL" in x
                    else (
                        None
                        if re.search(r"(T[0-9]{1,2})", x) is None
                        else re.search(r"(T[0-9]{1,2})", x).groups()[0]
                    )
                )
            )

            # Select relevant columns for the final data
            data = df_mids.loc[
                (df_mids["timepoint"] != "Ctrl") & (~df_mids["timepoint"].isnull()),
                ["timepoint", "value", "mass_isotopomer"],
            ]

            # Replace "mass_isotopomer" with "isotopomer" in the final data
            data.rename(columns={"mass_isotopomer": "isotopomer"}, inplace=True)

            # Store the dataframe in the dictionary with metabolite name as the key
            metabolite_dataframes[metabolite] = data

    return {
        metabolite: df.to_dict(orient="records")
        for metabolite, df in metabolite_dataframes.items()
    }


def fill_missing_measurements(dataframe, ctrl_label="Ctrl"):
    # Extract the complete structure from the Ctrl sample
    ctrl_structure = dataframe[dataframe["condition"] == ctrl_label][
        "mass_isotopomer"
    ].unique()

    # Create a list to hold the filled data
    filled_data = []

    # For each unique condition, check and fill missing measurements
    for sample in dataframe["sample"].unique():
        subset = dataframe[dataframe["sample"] == sample]
        present_measurements = subset["mass_isotopomer"].unique()
        missing_measurements = set(ctrl_structure) - set(present_measurements)
        # Add present data to the filled_data list
        filled_data.append(subset)

        # Create rows for missing measurements and add to the filled_data list
        for missing in missing_measurements:
            new_row = {
                "condition": subset["condition"].unique()[0],
                "mass_isotopomer": missing,
                "relative_intensity": 0,  # Assuming 0 value for missing data
                "experiment": subset["experiment"].unique()[0],
                "sample": sample,
                "reference": subset["reference"].unique()[0],
                "name": subset["name"].unique()[0],
                "replicate": "filled",
            }

            filled_data.append(pd.DataFrame([new_row]))

    # Combine all the data together
    filled_dataframe = pd.concat(filled_data, ignore_index=True)

    return filled_dataframe


def calculate_mid(df, ctrl_label="Ctrl"):
    carbon_abu = lambda intensity: intensity * (0.0107 / 0.9893)

    df["sample"] = df["reference"].astype(str) + df["name"].astype(str)
    metabolite_dict = {}
    for metabolite in df["name"].unique():
        df_metabolite = df[df["name"] == metabolite]

        experiment_dict = {}
        for experiment in df_metabolite["experiment"].unique():
            df_sub = df_metabolite[df_metabolite["experiment"] == experiment]

            # Calculate the sum of "Area" per group of ["sample", "mass_isotopomer"]
            df_sub["sum_area"] = df_sub.groupby(["sample", "mass_isotopomer"])[
                "intensity"
            ].transform("sum")
            df_sub = df_sub.drop_duplicates(["sample", "mass_isotopomer"])

            # Calculate the sum of "sum_area" per group of "sample"
            df_sub["sum_sample_area"] = df_sub.groupby(["sample"])[
                "sum_area"
            ].transform("sum")

            # Calculate "relative_intensity" by dividing "sum_area" by "sum_sample_area" for each group of ["sample", "mass_isotopomer"]
            df_sub["relative_intensity"] = (
                df_sub.groupby(["sample", "mass_isotopomer"], as_index=False)
                .apply(lambda x: x["sum_area"] / x["sum_sample_area"])
                .reset_index(level=0, drop=True)
            )

            # Extract the number after 'm+' or 'M+' from the "mass_isotopomer" column and convert it to integer
            df_sub["order"] = df_sub["mass_isotopomer"].str.extract(r"(?i)m\+(\d+)")

            # Check if extraction resulted in NaNs
            if df_sub["order"].isna().any():
                raise UserInputError(
                    "Could not identify Mass Isotopomers. Are they in the correct format M+0 or m+0?"
                )

            # Convert to integer
            df_sub["order"] = df_sub["order"].astype(int)
            # Sort df_sub by the 'order' column
            df_sub = df_sub.sort_values("order")

            df_sub = fill_missing_measurements(df_sub, ctrl_label=ctrl_label)

            unlabeled = (
                df_sub[df_sub["condition"].str.contains(ctrl_label)]
                .groupby("mass_isotopomer", sort=False)["relative_intensity"]
                .agg(["mean", "std"])
            )

            intensity_unlabeled = unlabeled["mean"]
            num_unlabeled = len(intensity_unlabeled)
            # Initialize the correction matrix with zeros and set the first column to the unlabeled intensities
            correction_matrix = np.zeros((num_unlabeled, num_unlabeled))
            correction_matrix[:, 0] = intensity_unlabeled

            # Calculate the rest of the correction matrix
            for index in range(1, num_unlabeled - 1):
                m1_corr = (intensity_unlabeled[0] * carbon_abu(index)) / (
                    (intensity_unlabeled[1] / intensity_unlabeled[0])
                    + 1
                    - carbon_abu(index)
                )
                m_a_0 = intensity_unlabeled[0] + m1_corr
                m_a_1 = intensity_unlabeled[1] - m1_corr
                intensity_new = [0] * index + [m_a_0, m_a_1]
                if index != (num_unlabeled - 2):
                    fill_rest = num_unlabeled - len(intensity_new)
                    intensity_new += list(intensity_unlabeled[2 : 2 + fill_rest])
                correction_matrix[:, index] = intensity_new

            index = num_unlabeled - 1
            m_a_0 = intensity_unlabeled[0] + (
                (intensity_unlabeled[0] * carbon_abu(index))
                / (
                    (intensity_unlabeled[1] / intensity_unlabeled[0])
                    + 1
                    - carbon_abu(index)
                )
            )

            intensity_new = [0] * index + [m_a_0]
            correction_matrix[:, index] = intensity_new

            # Calculate corrected values for each sample using the correction matrix
            df_mids = (
                df_sub[~df_sub["condition"].str.contains(ctrl_label)]
                .groupby(["sample"])
                .apply(
                    lambda x: np.dot(
                        np.linalg.inv(correction_matrix), x.relative_intensity
                    )
                )
            )

            # Create a DataFrame from the corrected values and melt it
            df_mids = pd.DataFrame(
                df_mids.tolist(),
                columns=[f"M+{index}" for index in range(num_unlabeled)],
                index=df_mids.index,
            )
            df_mids["sample"] = df_mids.index

            df_mids = pd.melt(
                df_mids,
                value_vars=[f"M+{index}" for index in range(num_unlabeled)],
                id_vars=["sample"],
            )

            df_sub["mass_isotopomer"] = df_sub["mass_isotopomer"].str.capitalize()
            df_mids["variable"] = df_mids["variable"].str.capitalize()

            # Merge the melted DataFrame with the original DataFrame
            df_mids = pd.merge(
                df_sub,
                df_mids,
                how="left",
                right_on=["sample", "variable"],
                left_on=["sample", "mass_isotopomer"],
            )

            grouped = (
                df_mids.groupby(["condition", "variable"])["value"]
                .agg(["mean", "std"])
                .reset_index()
            )

            # Select relevant columns for the final data
            data = grouped.loc[
                (grouped["condition"] != ctrl_label) & (~grouped["condition"].isnull()),
                ["condition", "variable", "mean", "std"],
            ]

            # Replace "mass_isotopomer" with "isotopomer" in the final data
            data.rename(columns={"variable": "isotopomer"}, inplace=True)

            if isinstance(experiment, (int, np.int64, np.int32)):
                experiment = str(experiment)

            data["metabolite"] = metabolite
            data["experiment"] = experiment

            data["order"] = data["isotopomer"].str.extract(r"(?i)m\+(\d+)")
            data["order"] = data["order"].astype(int)
            data = data.sort_values("order")
            data = data.drop(columns=["order"])

            data_dict = data.to_dict(orient="records")
            
            experiment_dict[experiment] = data_dict
        metabolite_dict[metabolite] = experiment_dict

    return metabolite_dict
